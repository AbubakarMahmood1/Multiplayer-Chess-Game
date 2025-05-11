const path = require('path');

module.exports = {
  module: {
    rules: [
      {
        test: /\.js$/,
        include: [
          path.resolve(__dirname, 'node_modules/chess.js')
        ],
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'
            ],
            plugins: [
              '@babel/plugin-transform-class-properties',
              '@babel/plugin-transform-optional-chaining',
              '@babel/plugin-transform-nullish-coalescing-operator'
            ]
          }
        }
      }
    ]
  }
};