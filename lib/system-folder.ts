export const ENV_FOLDER_NAME = 'env';
export const LEGACY_VARIABLES_FOLDER_NAME = 'variables';

export function isSystemFolderName(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized === ENV_FOLDER_NAME || normalized === LEGACY_VARIABLES_FOLDER_NAME;
}

export function isCanonicalEnvFolderName(name: string) {
  return name.trim().toLowerCase() === ENV_FOLDER_NAME;
}