# Fonts

Inter 4.1 by The Inter Project Authors, licensed under the SIL Open Font License 1.1 (see OFL.txt).
Source: https://github.com/rsms/inter/releases/tag/v4.1 (Inter-4.1.zip, sha256 9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e).
The files are copied as-is, not subset or renamed.

| File | sha256 |
| --- | --- |
| Inter-Regular.ttf | 40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82 |
| Inter-Bold.ttf | 288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f |
| OFL.txt | 262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a |

Loaded at runtime with expo-font `useFonts` in `src/app/_layout.tsx` (family names `Inter-Regular`, `Inter-Bold`).
Why: every Text needs an explicit fontFamily, see `fonts` in `src/ui/theme.ts`.
