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
  } catch (_e) {
    // best-effort presentation
  }
};

export const dismissSheet = (name?: string) => {
  if (!name) return;
  const actions = registry.get(name);
  if (!actions) return;
  try {
    actions.dismiss();
  } catch (_e) {
    // best-effort dismissal
  }
};

export const dismissAllSheets = () => {
  registry.forEach(actions => {
    try {
      actions.dismiss();
    } catch (_e) {
      // best-effort dismissal
    }
  });
};

export default {
  registerSheet,
  unregisterSheet,
  presentSheet,
  dismissSheet,
  dismissAllSheets,
};
