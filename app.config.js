const base = require('./app.json');

module.exports = {
  ...base.expo,
  extra: {
    ...base.expo.extra,
    posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
    posthogHost: process.env.POSTHOG_HOST,
  },
};
