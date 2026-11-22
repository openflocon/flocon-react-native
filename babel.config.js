// Used by Jest only: the packages are bundled by Metro (babel-preset-expo) in the apps.
module.exports = (api) => {
  const isTest = api.env('test');
  if (!isTest) return { presets: ['babel-preset-expo'] };
  return {
    presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
  };
};
