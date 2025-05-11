const path = require('path');
const babelLoaderConfig = require('./babel-loader.config');

module.exports = function override(config, env) {
  // First handle chess.js as before
  const babelLoaderRule = config.module.rules
    .find(rule => rule.oneOf)
    .oneOf.find(rule => rule.loader && rule.loader.includes('babel-loader'));

  if (babelLoaderRule) {
    const originalExclude = babelLoaderRule.exclude;
    
    babelLoaderRule.exclude = function excludeAllButChessJs(modulePath) {
      if (modulePath.includes('node_modules/chess.js')) {
        return false; // don't exclude chess.js
      }
      
      if (typeof originalExclude === 'function') {
        return originalExclude(modulePath);
      }
      
      if (originalExclude && originalExclude.test) {
        return originalExclude.test(modulePath);
      }
      
      return /node_modules/.test(modulePath) && !modulePath.includes('node_modules/chess.js');
    };
  }

  // Now add a special rule for sanitize-html and related modules
  config.module.rules.unshift({
    test: /\.js$/,
    include: [
      path.resolve(__dirname, 'node_modules/sanitize-html'),
      path.resolve(__dirname, 'node_modules/htmlparser2'),
      path.resolve(__dirname, 'node_modules/domelementtype')
    ],
    use: {
      loader: 'babel-loader',
      options: babelLoaderConfig
    }
  });

  return config;
}