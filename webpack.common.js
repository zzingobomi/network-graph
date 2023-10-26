const path = require("path");
const fs = require("fs");
const appDirectory = fs.realpathSync(process.cwd());
const CopyPlugin = require("copy-webpack-plugin");
const Dotenv = require("dotenv-webpack");

module.exports = {
  entry: path.resolve(appDirectory, "src/index.ts"),
  output: {
    filename: "js/bundle.js",
    clean: true,
    path: path.resolve(__dirname, "dist"),
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    fallback: {
      console: false,
      assert: false,
      util: false,
    },
    alias: {
      "@src": path.resolve(__dirname, "./src"),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            //sourceMap: true,
          },
        },
      },
      {
        test: /\.glsl$/,
        exclude: /node_modules/,
        loader: "raw-loader",
      },
    ],
  },
  plugins: [
    new Dotenv(),
    new CopyPlugin({
      patterns: [{ from: "public/", to: "./" }],
    }),
    //new BundleAnalyzerPlugin()
  ],
  mode: "development",
};
