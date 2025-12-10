type SheetActions = {
  present: () => void;
  dismiss: () => void;
};

const registry = new Map<string, SheetActions>();

export const registerSheet = (name: string, actions: SheetActions) => {
  if (!name) return;
  registry.set(name, actions);
};

export const unregisterSheet = (name: string) => {
  if (!name) return;
  registry.delete(name);
};

export const presentSheet = (name?: string) => {
  if (!name) return;
  const actions = registry.get(name);
  if (!actions) return;
  try {
    actions.present();
  } catch (e) {
    // best-effort presentation
  }
};

export const dismissSheet = (name?: string) => {
  if (!name) return;
  const actions = registry.get(name);
  if (!actions) return;
  try {
    actions.dismiss();
  } catch (e) {
    // best-effort dismissal
  }
};

export default {
  registerSheet,
  unregisterSheet,
  presentSheet,
  dismissSheet,
};
