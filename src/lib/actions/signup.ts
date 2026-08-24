'use server';

import { provisionAccount, type SignupResult } from '@/lib/signup';

/**
 * Server Action wrapper. All the logic lives in lib/signup.ts so it can be
 * tested without rendering a form; this file exists only to expose it to the
 * client component, and a 'use server' module may export nothing but async
 * functions.
 */
export async function signUp(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<SignupResult> {
  return provisionAccount(input);
}
