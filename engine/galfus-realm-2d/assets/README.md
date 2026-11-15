# UI fonts

The renderer embeds Noto Sans variable regular and italic as its default font.
The font files and `LICENSE-NotoSans.txt` are from the
[Google Fonts Noto Sans repository](https://github.com/google/fonts/tree/main/ofl/notosans)
and are distributed under the SIL Open Font License 1.1.

Noto Color Emoji is also embedded and used as the ordered fallback for emoji.
Its font and `LICENSE-NotoColorEmoji.txt` come from
[Noto Emoji](https://github.com/googlefonts/noto-emoji) and are distributed
under the SIL Open Font License 1.1.

Color glyph bitmaps are cached per realm by face, glyph and text size. The cache
retains up to 512 entries and 8 MiB of pixel data, evicting least recently used
entries. Each text node still has its own positioned and clipped geometry.
