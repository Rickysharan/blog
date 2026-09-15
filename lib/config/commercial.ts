type CommercialEnvironment = Readonly<NodeJS.ProcessEnv>;

export function commercialFeaturesEnabled(
  env: CommercialEnvironment = process.env,
): boolean {
  return env.COMMERCIAL_FEATURES_ENABLED === "true";
}
