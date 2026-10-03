/** State returned by the settings Server Actions. */
export type SettingsActionState = {
  error?: string;
  ok?: string;
  fieldErrors?: { name?: string; timezone?: string };
};

export const initialSettingsState: SettingsActionState = {};
