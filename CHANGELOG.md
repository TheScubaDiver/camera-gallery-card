# Changelog

## [2.11.1](https://github.com/TheScubaDiver/camera-gallery-card/compare/v2.11.0...v2.11.1) (2026-05-17)


### Bug Fixes

* don't render offline placeholder over grid layout ([#142](https://github.com/TheScubaDiver/camera-gallery-card/issues/142)) ([9088601](https://github.com/TheScubaDiver/camera-gallery-card/commit/9088601d3eeb3e7c8ecdb9718bf416ab132103b8))

## [2.11.0](https://github.com/TheScubaDiver/camera-gallery-card/compare/v2.10.0...v2.11.0) (2026-05-16)


### Features

* add per-camera two-way audio (talkback) via WebRTC ([#137](https://github.com/TheScubaDiver/camera-gallery-card/issues/137)) ([a2ebc13](https://github.com/TheScubaDiver/camera-gallery-card/commit/a2ebc1364d41e0afc00c28473604d6f15b5409b8))
* add runtime mute toggle pill to gallery video preview ([#130](https://github.com/TheScubaDiver/camera-gallery-card/issues/130)) ([50a6d87](https://github.com/TheScubaDiver/camera-gallery-card/commit/50a6d876921180a6109aa770ad6e9c822412116f))
* auto-detect title-based date formats for flat media sources ([#118](https://github.com/TheScubaDiver/camera-gallery-card/issues/118)) ([16ee49e](https://github.com/TheScubaDiver/camera-gallery-card/commit/16ee49e6b014348b828e47848584da734627cf25))
* configurable row spacing ([#133](https://github.com/TheScubaDiver/camera-gallery-card/issues/133)) ([663ffee](https://github.com/TheScubaDiver/camera-gallery-card/commit/663ffeeeb321a7808630851b7ec40892912a330b))
* parse Unix epoch + start-end range filenames in path_datetime_format ([#141](https://github.com/TheScubaDiver/camera-gallery-card/issues/141)) ([001556a](https://github.com/TheScubaDiver/camera-gallery-card/commit/001556a1431cb0530b0126cddfd2ec8225d220f9))
* prev/next navigation in fullscreen viewer + keyboard nav in live mode ([#134](https://github.com/TheScubaDiver/camera-gallery-card/issues/134)) ([4dc531b](https://github.com/TheScubaDiver/camera-gallery-card/commit/4dc531bc4409e6d389dfaf01b8b8ef32c16c474e))


### Bug Fixes

* differentiate Direct API states in diagnostics ([#127](https://github.com/TheScubaDiver/camera-gallery-card/issues/127)) ([ab57a6c](https://github.com/TheScubaDiver/camera-gallery-card/commit/ab57a6cc7a6bf56407e24a1d12e121fb88f6565a))
* extract card styles + typed STYLE_SECTIONS + audit hardening ([#136](https://github.com/TheScubaDiver/camera-gallery-card/issues/136)) ([cac3c3a](https://github.com/TheScubaDiver/camera-gallery-card/commit/cac3c3a6a43cfc67ac7a06315373f79d22525112))
* extract item pipeline + view filters + navigation + live-config + diagnostics ([#128](https://github.com/TheScubaDiver/camera-gallery-card/issues/128)) ([d177729](https://github.com/TheScubaDiver/camera-gallery-card/commit/d17772924de462777d1c8eba2576b74b7c1013e8))
* extract PosterCacheClient with audited hardening ([#121](https://github.com/TheScubaDiver/camera-gallery-card/issues/121)) ([290d10d](https://github.com/TheScubaDiver/camera-gallery-card/commit/290d10d9cc4517127e0c2f5f8f9f5ddf740093dd))
* preserve custom names in object_filters ([#129](https://github.com/TheScubaDiver/camera-gallery-card/issues/129)) ([c2cc3a9](https://github.com/TheScubaDiver/camera-gallery-card/commit/c2cc3a93f19f55653938c9e6361727a0d9f9b852))
* scale fixed-mode pills with --cgc-pill-size variable ([#123](https://github.com/TheScubaDiver/camera-gallery-card/issues/123)) ([7f2f89f](https://github.com/TheScubaDiver/camera-gallery-card/commit/7f2f89f79ec9c8f4a85d079efc4e61197faad78f))
* talkback bar swaps to top when pills are anchored at the bottom ([#140](https://github.com/TheScubaDiver/camera-gallery-card/issues/140)) ([f260eed](https://github.com/TheScubaDiver/camera-gallery-card/commit/f260eed422e0606814ca129958b7a9376a3c0993))
* undefined isVideo() reference throws on every sensor-source render ([#138](https://github.com/TheScubaDiver/camera-gallery-card/issues/138)) ([223edcb](https://github.com/TheScubaDiver/camera-gallery-card/commit/223edcb8b1b396f814ce29f9c8bdd3feaa4e2653))


### Documentation

* refresh README — Frigate WS, grid mode, debug, YAML examples ([#125](https://github.com/TheScubaDiver/camera-gallery-card/issues/125)) ([26c6a85](https://github.com/TheScubaDiver/camera-gallery-card/commit/26c6a85725bea7ea3307d3556a323944496c025c))


### Code Refactoring

* glass-uniform look for live-view pills + chevrons ([#139](https://github.com/TheScubaDiver/camera-gallery-card/issues/139)) ([824d1e3](https://github.com/TheScubaDiver/camera-gallery-card/commit/824d1e39af8bf4ff1d1ba1c8453c1ba7d5ad4b04))

## [2.10.0](https://github.com/TheScubaDiver/camera-gallery-card/compare/v2.9.0...v2.10.0) (2026-05-12)


### Features

* calendar-first media walker with lazy day loading ([#101](https://github.com/TheScubaDiver/camera-gallery-card/issues/101)) ([a0362d7](https://github.com/TheScubaDiver/camera-gallery-card/commit/a0362d71303f8a6d6fbba486e4df898cb6d44ea2))
* configurable card height ([#93](https://github.com/TheScubaDiver/camera-gallery-card/issues/93)) ([9adf0d5](https://github.com/TheScubaDiver/camera-gallery-card/commit/9adf0d595687e1ad2d499004ec69e49ebdf3e200))
* debug mode with diagnostics modal ([#96](https://github.com/TheScubaDiver/camera-gallery-card/issues/96)) ([76e5307](https://github.com/TheScubaDiver/camera-gallery-card/commit/76e530738e3a060f038f69f3f654b96aa8b95bc4))
* delete frigate clips from the gallery ([#113](https://github.com/TheScubaDiver/camera-gallery-card/issues/113)) ([8064208](https://github.com/TheScubaDiver/camera-gallery-card/commit/80642087cbfcea06afc29d51f69310d6e7ee09e4))
* multi-camera grid layout for live view ([#94](https://github.com/TheScubaDiver/camera-gallery-card/issues/94)) ([3c2c662](https://github.com/TheScubaDiver/camera-gallery-card/commit/3c2c662f6d5a8c81f495ba99057c703e850b82e5))
* red selection style and matching delete button ([#114](https://github.com/TheScubaDiver/camera-gallery-card/issues/114)) ([acbbe00](https://github.com/TheScubaDiver/camera-gallery-card/commit/acbbe007a691f503b8b7afd108dfc1a8301709e6))
* sort order toggle for thumbnails ([#116](https://github.com/TheScubaDiver/camera-gallery-card/issues/116)) ([48af8ff](https://github.com/TheScubaDiver/camera-gallery-card/commit/48af8ff5965b0c4af88d36d6fce41d44f6381110))


### Bug Fixes

* extract pairing helpers and favorites storage ([#85](https://github.com/TheScubaDiver/camera-gallery-card/issues/85)) ([8ffffa6](https://github.com/TheScubaDiver/camera-gallery-card/commit/8ffffa6cfcba461b1e41685becf894c0ccd28671))
* extract sensor/media/combined data clients with audited fixes ([#100](https://github.com/TheScubaDiver/camera-gallery-card/issues/100)) ([f8cb64e](https://github.com/TheScubaDiver/camera-gallery-card/commit/f8cb64e9580cd7e1e09081f20b501a4f6a37d86f))
* keep WebSocket fallback alive when Direct API fails ([#112](https://github.com/TheScubaDiver/camera-gallery-card/issues/112)) ([3a54b92](https://github.com/TheScubaDiver/camera-gallery-card/commit/3a54b92aab85c9cfbb7870e59eb01afe4b0350c6))
* tear down live stream when leaving live view ([#109](https://github.com/TheScubaDiver/camera-gallery-card/issues/109)) ([#110](https://github.com/TheScubaDiver/camera-gallery-card/issues/110)) ([8bff099](https://github.com/TheScubaDiver/camera-gallery-card/commit/8bff09942efea6143a0ea5dcc5e75fd1bc638195))
* use CSS fallback for fullscreen in HA Android Companion ([#97](https://github.com/TheScubaDiver/camera-gallery-card/issues/97)) ([50bdc2e](https://github.com/TheScubaDiver/camera-gallery-card/commit/50bdc2e8c0baa6b499486bd622c4a809806c07fc))


### Code Refactoring

* drop redundant allow_delete config flag ([#115](https://github.com/TheScubaDiver/camera-gallery-card/issues/115)) ([62bd5b1](https://github.com/TheScubaDiver/camera-gallery-card/commit/62bd5b18e87ab38118e48d184b56f17b845d77e4))

## [2.9.0](https://github.com/TheScubaDiver/camera-gallery-card/compare/v2.8.0...v2.9.0) (2026-05-04)


### Features

* favorites ([#70](https://github.com/TheScubaDiver/camera-gallery-card/issues/70)) ([98da87e](https://github.com/TheScubaDiver/camera-gallery-card/commit/98da87e4751b9e8c328474bd87a58dfe895d0e33))
* pair same-stem jpg/mp4 in sensor and combined mode ([#67](https://github.com/TheScubaDiver/camera-gallery-card/issues/67)) ([7d938ad](https://github.com/TheScubaDiver/camera-gallery-card/commit/7d938add21e83aef4a8ab6128c4bec0d8de57030))
* real-time Frigate event updates via Home Assistant WebSocket ([#83](https://github.com/TheScubaDiver/camera-gallery-card/issues/83)) ([4551b36](https://github.com/TheScubaDiver/camera-gallery-card/commit/4551b36f59c6288bfc73dd11681b05c7e4824af1))


### Bug Fixes

* live-mode thumbnail, favorite button, hardcoded Dutch + typed config ([#72](https://github.com/TheScubaDiver/camera-gallery-card/issues/72)) ([427a102](https://github.com/TheScubaDiver/camera-gallery-card/commit/427a102c469ecb312f18d532a82bdf6bfc9916f2))
* reduce topbar button spacing ([#69](https://github.com/TheScubaDiver/camera-gallery-card/issues/69)) ([bd26448](https://github.com/TheScubaDiver/camera-gallery-card/commit/bd2644844e7e06e13b1438c3383098473b5ea4e5))
* retry direct Frigate API after transient failures ([#81](https://github.com/TheScubaDiver/camera-gallery-card/issues/81)) ([1e239ee](https://github.com/TheScubaDiver/camera-gallery-card/commit/1e239eebd6eeec35191cbef1d3213d9e83748f44))
* use paired same-stem jpg as thumbnail for mp4 in media source mode ([#65](https://github.com/TheScubaDiver/camera-gallery-card/issues/65)) ([a3e2221](https://github.com/TheScubaDiver/camera-gallery-card/commit/a3e2221a3a6aefe7eef7c790e1633c0b9e9e14d7))

## [2.8.0](https://github.com/TheScubaDiver/camera-gallery-card/compare/v2.7.0...v2.8.0) (2026-04-30)


### Features

* show placeholder for offline/unavailable live cameras ([#58](https://github.com/TheScubaDiver/camera-gallery-card/issues/58)) ([6bc23ef](https://github.com/TheScubaDiver/camera-gallery-card/commit/6bc23efcce1a942bf26f423fe94c2da81fc8eac9))


### Bug Fixes

* explicit-only datetime parsing and traverse newest folder first ([#56](https://github.com/TheScubaDiver/camera-gallery-card/issues/56)) ([3322efa](https://github.com/TheScubaDiver/camera-gallery-card/commit/3322efa448674f637b5750fa167462c4542ad6c1))
* replace deprecated app-id with client-id in GitHub App token action ([#62](https://github.com/TheScubaDiver/camera-gallery-card/issues/62)) ([9a05562](https://github.com/TheScubaDiver/camera-gallery-card/commit/9a0556280086c05d8ea2fb2488b810db98fe0b56))
* stop spamming 404s and decode errors on broken media files ([#55](https://github.com/TheScubaDiver/camera-gallery-card/issues/55)) ([ce0d150](https://github.com/TheScubaDiver/camera-gallery-card/commit/ce0d15066799d567c2244d4d25dde7acb5d3c540))


### Code Refactoring

* distribute bundle as release asset only ([#63](https://github.com/TheScubaDiver/camera-gallery-card/issues/63)) ([ba3a92e](https://github.com/TheScubaDiver/camera-gallery-card/commit/ba3a92ea2a7f203e058c6aed9209370693950fcd))
* extract const.ts and typing baseline ([#53](https://github.com/TheScubaDiver/camera-gallery-card/issues/53)) ([ffafcc1](https://github.com/TheScubaDiver/camera-gallery-card/commit/ffafcc1bb15e8107583855eb62977d01500f7a59))
* move pill controls from thumbnails tab to styling section ([#61](https://github.com/TheScubaDiver/camera-gallery-card/issues/61)) ([2fe2e66](https://github.com/TheScubaDiver/camera-gallery-card/commit/2fe2e66a99318f6fd44d196c58f8e16538aacc07))

## [2.7.0](https://github.com/TheScubaDiver/camera-gallery-card/compare/v2.6.0...v2.7.0) (2026-04-28)


### Features

* set up automated build, CI, and release pipeline ([#36](https://github.com/TheScubaDiver/camera-gallery-card/issues/36)) ([65d2824](https://github.com/TheScubaDiver/camera-gallery-card/commit/65d282419212e23ad955ac57ef81ca77eab8ef3c))


### Bug Fixes

* use release-please inline marker on README version line ([#52](https://github.com/TheScubaDiver/camera-gallery-card/issues/52)) ([44f9f96](https://github.com/TheScubaDiver/camera-gallery-card/commit/44f9f96d1a459fadba68a06a6bc7d3fdb9509a86))


### Documentation

* rewrite contributor guide and auto-update README version ([#51](https://github.com/TheScubaDiver/camera-gallery-card/issues/51)) ([68e2b89](https://github.com/TheScubaDiver/camera-gallery-card/commit/68e2b8918bf5bb77ea54075b456c42d5ddc02a8c))

## Changelog

All notable changes to this project are documented here.

From v2.7.0 onward this file is generated automatically by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/) on `main`. Earlier history lives in the [GitHub Releases](https://github.com/TheScubaDiver/camera-gallery-card/releases) page.
