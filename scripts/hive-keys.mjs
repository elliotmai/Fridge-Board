#!/usr/bin/env node
/*
 * Makes the key pair for Hive passes. Run once:  node scripts/hive-keys.mjs
 *
 *   HIVE_SIGNING_KEY  → Hive's Netlify environment only. Secret: whoever has it
 *                       can sign anyone into your apps.
 *   HIVE_PUBLIC_KEY   → each app's Netlify environment. Safe to share.
 *
 * Running it again makes a new pair; then update both places.
 */
import { makeKeys } from '../netlify/lib/hiveAssertion.mjs';

const { signingKey, publicKey } = makeKeys();
console.log(`HIVE_SIGNING_KEY=${signingKey}\n\nHIVE_PUBLIC_KEY=${publicKey}`);
