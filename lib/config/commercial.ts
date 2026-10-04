type CommercialEnvironment = Readonly<NodeJS.ProcessEnv>;

export function commercialFeaturesEnabled(
  env: CommercialEnvironment = process.env,
): boolean {
  return env.COMMERCIAL_FEATURES_ENABLED === "true";
}

export const ADSENSE_PUBLISHER_ID_PATTERN = /^pub-\d{16}$/;
export const ADSENSE_CLIENT_ID_PATTERN = /^ca-pub-\d{16}$/;
export const ADSENSE_SLOT_ID_PATTERN = /^\d{10}$/;

export type AdsenseServingConfig = {
  enabled: boolean;
  publisherId: string | null;
  clientId: string | null;
};

export function adsenseServingConfig(
  env: CommercialEnvironment = process.env,
): AdsenseServingConfig {
  const publisherId = env.ADSENSE_PUBLISHER_ID;
  const clientId = env.ADSENSE_CLIENT_ID;
  const validPublisher = Boolean(publisherId && ADSENSE_PUBLISHER_ID_PATTERN.test(publisherId));
  const validClient = Boolean(clientId && ADSENSE_CLIENT_ID_PATTERN.test(clientId));
  const matchingIds = validPublisher && validClient && clientId === `ca-${publisherId}`;

  return {
    enabled:
      commercialFeaturesEnabled(env) &&
      env.ADSENSE_ENABLED === "true" &&
      env.ADSENSE_SITE_STATUS === "READY" &&
      matchingIds,
    publisherId: validPublisher ? publisherId! : null,
    clientId: validClient ? clientId! : null,
  };
}
