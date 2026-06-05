import { Router } from 'express';
import { randomUUID } from 'crypto';
import express from 'express';
import { parseEnhanceMultipart } from '../middleware/parseEnhanceMultipart.js';
import { forwardEnhanceToAgent } from '../services/enhanceProxy.js';
import { extractAfterImageBuffer } from '../services/enhancePayload.js';
import { isR2Configured, putObject, resolveReadUrl } from '../services/r2Storage.js';
import { createEnhancePairDoc } from '../services/enhancePairs.js';
import {
  refundSimulationCredit,
  tryDebitSimulationCredit,
  tryDebitPreviewCredit,
  refundPreviewCredit,
} from '../services/simulationQuotas.js';
import { resolveEnhanceRegioes } from '../services/enhanceDefaultRegions.js';
import mongoose from 'mongoose';
import { Patient } from '../models/patient.js';
import { patientHasPhotoConsent } from '../services/patients.js';
import { recordGenerationUsageAsync } from '../services/aiUsageRecorder.js';

async function assertPatientConsentForEnhance(userId, parsed) {
  const ack = String(parsed.patientConsentAck ?? '').trim();
  const ackOk = ack === '1' || ack.toLowerCase() === 'true' || ack.toLowerCase() === 'yes' || ack === 'on';
  if (!ackOk) {
    return { ok: false, message: 'Confirme o consentimento do paciente antes de processar a foto.', code: 'PATIENT_CONSENT_REQUIRED' };
  }
  const patientId = String(parsed.patientId || '').trim();
  if (!patientId || !mongoose.isValidObjectId(patientId)) {
    return { ok: false, message: 'Informe o paciente vinculado à simulação.', code: 'PATIENT_CONSENT_REQUIRED' };
  }
  const patient = await Patient.findOne({ _id: patientId, userId }).lean();
  if (!patient) {
    return { ok: false, message: 'Paciente não encontrado.', code: 'PATIENT_CONSENT_REQUIRED' };
  }
  if (!patientHasPhotoConsent(patient)) {
    return {
      ok: false,
      message: 'Registre o consentimento do paciente antes de enviar a foto para a IA.',
      code: 'PATIENT_CONSENT_REQUIRED',
    };
  }
  return { ok: true };
}

function extFromMime(mime, filename) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (filename && typeof filename === 'string') {
    const match = /\.([a-z0-9]+)$/i.exec(filename);
    if (match) return match[1].toLowerCase();
  }
  return 'jpg';
}

function mergeAgentBody(agentData) {
  if (typeof agentData === 'object' && agentData !== null && !Array.isArray(agentData)) {
    return { ...agentData };
  }
  return { _agent: agentData };
}

async function callAgentAndRecord({
  userId,
  eventType,
  agentBase,
  parsed,
  regioesForAgent,
  deferSuccessRecord = false,
}) {
  const started = Date.now();
  const { data: agentData, status } = await forwardEnhanceToAgent(agentBase, {
    buffer: parsed.fileBuffer,
    filename: parsed.filename,
    mime: parsed.mime,
    tipos: parsed.tipos,
    regioes: regioesForAgent,
    intensidade: parsed.intensidade,
    intensidadePct: parsed.intensidadePct,
    practiceProfile: parsed.practiceProfile || undefined,
    detalhes: parsed.detalhes && String(parsed.detalhes).trim() ? String(parsed.detalhes).trim() : undefined,
  });
  const latencyMs = Date.now() - started;

  const record = (outcome, pairId) => {
    recordGenerationUsageAsync({
      userId,
      eventType,
      outcome,
      parsed,
      agentData,
      pairId,
      latencyMs,
      agentHttpStatus: status,
    });
  };

  if (status >= 400) {
    record('failed');
    return { ok: false, agentData, status, latencyMs };
  }

  const extracted = extractAfterImageBuffer(agentData);
  if (extracted.error) {
    record('failed');
    return { ok: false, agentData, status, latencyMs, noImage: true };
  }

  if (deferSuccessRecord) {
    return {
      ok: true,
      agentData,
      status,
      latencyMs,
      extracted,
      pendingRecord: {
        userId,
        eventType,
        outcome: 'success',
        parsed,
        agentData,
        latencyMs,
        agentHttpStatus: status,
      },
    };
  }

  record('success');
  return { ok: true, agentData, status, latencyMs, extracted };
}

export function createEnhancePostRouter(requireAuth) {
  const r = Router();

  // ── POST /v1/enhance?preview=1  (pré-visualização — debita preview credit, sem R2) ──
  // ── POST /v1/enhance             (simulação final — debita simulation credit, com R2) ──
  r.post('/v1/enhance', requireAuth, async (req, res, next) => {
    const isPreview = req.query.preview === '1';
    let debited = false;
    const userId = req.userId;
    try {
      if (req.query.format !== 'json') {
        res.status(400).json({ message: 'Use query format=json' });
        return;
      }

      const agentBase = process.env.ENHANCE_AGENT_BASE_URL?.trim();
      if (!agentBase) {
        res.status(503).json({ message: 'ENHANCE_AGENT_BASE_URL não configurada' });
        return;
      }

      const parsed = await parseEnhanceMultipart(req);
      if (!parsed.fileBuffer?.length) {
        res.status(400).json({ message: 'Campo image obrigatório' });
        return;
      }
      if (!parsed.tipos.length) {
        res.status(400).json({ message: 'Informe ao menos um tipo_procedimento' });
        return;
      }

      const regioesForAgent = resolveEnhanceRegioes(parsed.regioes, parsed.tipos);
      if (!String(regioesForAgent || '').trim()) {
        res.status(400).json({
          message:
            'Não foi possível determinar as regiões-alvo para a IA (procedimento não reconhecido ou regiões vazias).',
        });
        return;
      }

      const consentCheck = await assertPatientConsentForEnhance(userId, parsed);
      if (!consentCheck.ok) {
        res.status(400).json({ message: consentCheck.message, code: consentCheck.code });
        return;
      }

      if (isPreview) {
        const debit = await tryDebitPreviewCredit(userId);
        if (!debit.ok) {
          const body = { message: debit.error };
          if (debit.code) body.code = debit.code;
          res.status(debit.status).json(body);
          return;
        }
        debited = true;

        const previewResult = await callAgentAndRecord({
          userId,
          eventType: 'preview',
          agentBase,
          parsed,
          regioesForAgent,
        });

        if (!previewResult.ok) {
          await refundPreviewCredit(userId);
          debited = false;
          const { agentData, status } = previewResult;
          if (previewResult.noImage) {
            res.status(502).json(
              typeof agentData === 'object' && agentData !== null
                ? mergeAgentBody(agentData)
                : { message: 'Resposta do agente sem imagem em base64' },
            );
            return;
          }
          if (typeof agentData === 'object' && agentData !== null) {
            res.status(status).json(agentData);
          } else {
            res.status(status).json({ message: String(agentData ?? 'Erro do agente') });
          }
          return;
        }

        res.json(mergeAgentBody(previewResult.agentData));
        return;
      }

      // ── Simulação final (fluxo original) ──
      const debit = await tryDebitSimulationCredit(userId);
      if (!debit.ok) {
        const body = { message: debit.error };
        if (debit.code) body.code = debit.code;
        res.status(debit.status).json(body);
        return;
      }
      debited = true;

      const simResult = await callAgentAndRecord({
        userId,
        eventType: 'simulation',
        agentBase,
        parsed,
        regioesForAgent,
        deferSuccessRecord: true,
      });

      if (!simResult.ok) {
        await refundSimulationCredit(userId);
        debited = false;
        const { agentData, status } = simResult;
        if (simResult.noImage) {
          res.status(502).json(
            typeof agentData === 'object' && agentData !== null
              ? mergeAgentBody(agentData)
              : { message: 'Resposta do agente sem imagem em base64' },
          );
          return;
        }
        if (typeof agentData === 'object' && agentData !== null) {
          res.status(status).json(agentData);
        } else {
          res.status(status).json({ message: String(agentData ?? 'Erro do agente') });
        }
        return;
      }

      const { agentData, extracted } = simResult;
      const pairId = randomUUID();
      const origExt = extFromMime(parsed.mime, parsed.filename);
      const afterExt = extFromMime(extracted.mime, null);

      const originalKey = `users/${userId}/enhance/${pairId}/original.${origExt}`;
      const afterKey = `users/${userId}/enhance/${pairId}/after.${afterExt}`;

      const out = mergeAgentBody(agentData);

      if (!isR2Configured()) {
        console.log('[R2] enhance: R2 não usado (env incompleta ou bucket vazio)', {
          hasEndpoint: Boolean(process.env.R2_ENDPOINT?.trim()),
          hasAccessKeyId: Boolean(process.env.R2_ACCESS_KEY_ID?.trim()),
          hasSecretAccessKey: Boolean(process.env.R2_SECRET_ACCESS_KEY?.trim()),
          bucket: process.env.R2_BUCKET_NAME?.trim() || '(vazio)',
        });
        if (simResult.pendingRecord) {
          recordGenerationUsageAsync(simResult.pendingRecord);
        }
        res.json(out);
        return;
      }

      console.log('[R2] enhance: iniciando upload + doc', { pairId, userId });

      try {
        await putObject(originalKey, parsed.fileBuffer, parsed.mime);
        await putObject(afterKey, extracted.buffer, extracted.mime);
        await createEnhancePairDoc({
          pairId,
          userId,
          originalKey,
          afterKey,
          originalContentType: parsed.mime,
          afterContentType: extracted.mime,
        });
        console.log('[R2] enhance: Mongo doc criado', { pairId });
        const originalUrl = await resolveReadUrl(originalKey);
        const afterUrl = await resolveReadUrl(afterKey);
        out.pairId = pairId;
        out.r2_original_url = originalUrl;
        out.r2_after_url = afterUrl;
        console.log('[R2] enhance: URLs de leitura prontas', {
          pairId,
          modo: process.env.R2_PUBLIC_BASE_URL?.trim() ? 'public_base' : 'presigned',
        });
        if (simResult.pendingRecord) {
          recordGenerationUsageAsync({ ...simResult.pendingRecord, pairId });
        }
      } catch (e) {
        console.error('[R2/Mongo] enhance falhou (resposta do agente segue sem pairId/R2)', {
          pairId,
          message: e?.message,
          name: e?.name,
          code: e?.Code ?? e?.code,
          httpStatusCode: e?.$metadata?.httpStatusCode,
          requestId: e?.$metadata?.requestId,
        });
        if (simResult.pendingRecord) {
          recordGenerationUsageAsync(simResult.pendingRecord);
        }
      }

      res.json(out);
    } catch (e) {
      if (debited) {
        try {
          if (isPreview) {
            await refundPreviewCredit(userId);
          } else {
            await refundSimulationCredit(userId);
          }
        } catch (re) {
          console.error('[enhance] refund após exceção', re?.message);
        }
      }
      next(e);
    }
  });

  // ── POST /v1/enhance/finalize  (salva preview aceito no R2 sem chamar o agente) ──
  r.post(
    '/v1/enhance/finalize',
    requireAuth,
    express.json({ limit: '25mb' }),
    async (req, res, next) => {
      const userId = req.userId;
      try {
        const { originalBase64, originalMime, afterBase64, afterMime } = req.body ?? {};

        if (!originalBase64 || !afterBase64) {
          res.status(400).json({ message: 'Campos originalBase64 e afterBase64 são obrigatórios' });
          return;
        }

        const origMime = String(originalMime || 'image/jpeg').trim();
        const aftMime = String(afterMime || 'image/png').trim();

        let originalBuffer;
        let afterBuffer;
        try {
          originalBuffer = Buffer.from(String(originalBase64).replace(/\s/g, ''), 'base64');
          afterBuffer = Buffer.from(String(afterBase64).replace(/\s/g, ''), 'base64');
        } catch {
          res.status(400).json({ message: 'base64 inválido em originalBase64 ou afterBase64' });
          return;
        }

        if (!originalBuffer.length || !afterBuffer.length) {
          res.status(400).json({ message: 'Imagem vazia após decodificação base64' });
          return;
        }

        if (!isR2Configured()) {
          console.log('[R2] finalize: R2 não configurado — retornando pairId nulo');
          res.json({ pairId: null });
          return;
        }

        const pairId = randomUUID();
        const origExt = extFromMime(origMime, null);
        const aftExt = extFromMime(aftMime, null);
        const originalKey = `users/${userId}/enhance/${pairId}/original.${origExt}`;
        const afterKey = `users/${userId}/enhance/${pairId}/after.${aftExt}`;

        console.log('[R2] finalize: iniciando upload + doc', { pairId, userId });

        await putObject(originalKey, originalBuffer, origMime);
        await putObject(afterKey, afterBuffer, aftMime);
        await createEnhancePairDoc({
          pairId,
          userId,
          originalKey,
          afterKey,
          originalContentType: origMime,
          afterContentType: aftMime,
        });

        const originalUrl = await resolveReadUrl(originalKey);
        const afterUrl = await resolveReadUrl(afterKey);

        console.log('[R2] finalize: concluído', { pairId });
        res.json({ pairId, r2_original_url: originalUrl, r2_after_url: afterUrl });
      } catch (e) {
        console.error('[R2/Mongo] finalize falhou', {
          message: e?.message,
          name: e?.name,
          code: e?.Code ?? e?.code,
          httpStatusCode: e?.$metadata?.httpStatusCode,
        });
        next(e);
      }
    },
  );

  return r;
}
