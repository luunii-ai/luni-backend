import { randomBytes } from 'crypto';
import { ProcessedStripeEvent } from '../models/processedStripeEvent.js';
import { getStripe } from './stripeClient.js';
import {
  findUserByEmail,
  createUserWithPassword,
  updateUserStripeFields,
  findUserByStripeSubscriptionId,
} from './users.js';
import {
  sendSubscriptionActivatedForExistingUserEmail,
  sendSubscriptionWelcomeEmail,
} from './email.js';
import {
  syncUserQuotaFromStripeSubscription,
  zeroUserQuota,
} from './simulationQuotas.js';

async function handleCheckoutSessionCompleted(session) {
  if (session.mode !== 'subscription') return;

  const subscriptionId = session.subscription;
  const customerId = session.customer;
  if (!subscriptionId || !customerId) {
    throw new Error('checkout.session.completed sem subscription ou customer');
  }

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(String(subscriptionId), {
    expand: ['items.data.price'],
  });
  const email = String(session.customer_details?.email || session.customer_email || '')
    .toLowerCase()
    .trim();
  if (!email) {
    throw new Error('checkout.session.completed sem e-mail do cliente');
  }

  const name = String(session.metadata?.app_user_name || 'Usuário').trim() || 'Usuário';
  const clinic = String(session.metadata?.app_user_clinic || '').trim();

  const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  const status = sub.status;

  const user = await findUserByEmail(email);
  if (user) {
    await updateUserStripeFields(user._id, {
      stripeCustomerId: String(customerId),
      stripeSubscriptionId: String(subscriptionId),
      subscriptionStatus: status,
      trialEndsAt,
    });
    await syncUserQuotaFromStripeSubscription(user._id, sub);
    if (String(user.accountType || '') === 'partner_test') {
      await updateUserStripeFields(user._id, {
        accountType: 'official',
        partnerTestExpiresAt: null,
      });
    }
    await sendSubscriptionActivatedForExistingUserEmail({
      to: email,
      loginUrl: process.env.SUBSCRIPTION_WELCOME_LOGIN_URL?.trim() || undefined,
    });
    return;
  }

  const tempPassword = randomBytes(18).toString('base64url');
  const newUser = await createUserWithPassword({
    name,
    clinic,
    email,
    password: tempPassword,
    firstAccess: true,
  });
  await updateUserStripeFields(newUser._id, {
    stripeCustomerId: String(customerId),
    stripeSubscriptionId: String(subscriptionId),
    subscriptionStatus: status,
    trialEndsAt,
  });
  await syncUserQuotaFromStripeSubscription(newUser._id, sub);
  await sendSubscriptionWelcomeEmail({
    to: email,
    tempPassword,
    loginUrl: process.env.SUBSCRIPTION_WELCOME_LOGIN_URL?.trim() || undefined,
  });
}

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(['canceled', 'cancelled', 'unpaid', 'incomplete_expired']);

async function handleSubscriptionUpdated(subscription) {
  const user = await findUserByStripeSubscriptionId(subscription.id);
  if (!user) return;

  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : user.trialEndsAt;
  await updateUserStripeFields(user._id, {
    subscriptionStatus: subscription.status,
    trialEndsAt,
  });

  if (TERMINAL_SUBSCRIPTION_STATUSES.has(String(subscription.status || '').toLowerCase())) {
    await zeroUserQuota(user._id);
  } else {
    // Expand may not be present on update events; try to sync if items exist.
    if (subscription.items?.data?.length) {
      await syncUserQuotaFromStripeSubscription(user._id, subscription);
    }
  }
}

export async function handleStripeEvent(event) {
  const existing = await ProcessedStripeEvent.findOne({ eventId: event.id });
  if (existing) return;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated(event.data.object);
        break;
      default:
        break;
    }
    await ProcessedStripeEvent.create({ eventId: event.id });
  } catch (e) {
    console.error('[stripe webhook]', event.type, e);
    throw e;
  }
}
