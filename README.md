# Maids
Creates new and registers existing unique application IDs. Each ID stored in MAIDs is guaranteed to be unique across the entire SmartDeviceLink (SDL) ecosystem.

[![Slack Status](http://sdlslack.herokuapp.com/badge.svg)](http://slack.smartdevicelink.com)
[![CircleCI](https://circleci.com/gh/smartdevicelink/sdl_shaid.svg?style=shield)](https://circleci.com/gh/smartdevicelink/sdl_shaid)
<a href="https://codecov.io/github/smartdevicelink/sdl_shaid_maids?branch=master" target="_blank"><img src="https://codecov.io/github/smartdevicelink/sdl_shaid_maids/coverage.svg?branch=master" /></a>
[![Dependency Status](https://david-dm.org/smartdevicelink/sdl_shaid_maids.svg)](https://david-dm.org/smartdevicelink/sdl_shaid_maids)

## Documentation
See [SmartDeviceLink.com](https://smartdevicelink.com/en/docs/shaid/master/overview/).  

The documentation is written in [DocDown](https://github.com/smartdevicelink/sdl_markdown_spec) and stored in the [smartdevicelink/sdl_shaid_docs](https://github.com/smartdevicelink/sdl_shaid_docs) repository.

## Basic Install and Run

1. ```git clone https://github.com/smartdevicelink/sdl_shaid_maids.git```
2. ```cd sdl_shaid_maids```
3. ```npm install```
4. ```npm start```
5. navigate to http://localhost:3000 in your browser of choice.

## Configuration
Configuration settings are defined using environment variables with a default fallback value if a particular environment variable is not defined. See ```config.js``` for available configuration options and their associated environment variable keys.

## Contribute
If you have a suggestion or find a bug please submit an <a href="https://github.com/smartdevicelink/sdl_shaid_maids/issues/new" target="_blank">issue</a>.  You can submit code using a pull request, but please follow the <a href="https://github.com/smartdevicelink/sdl_shaid_maids/blob/master/CONTRIBUTING.md" target="_blank">contributing guidelines</a>.
