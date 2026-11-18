# Badge images

These are the issuers' official digital badges, shown only to identify each
certification. They are trademarks of their respective owners and are not
covered by this repository's MIT license. pathfinder is not affiliated with
any issuer.

Where each image comes from is recorded in `data/badges.json`. Regenerate with
`node scripts/badges.mjs`.

The ISC2 badges (`isc2-*.webp`) ship as transparent PNGs with black lettering, which
disappears on the dark theme. Their webp files add a plain white fill inside the
badge frame, as ISC2 shows them on white; `scripts/badges.mjs` does not do this, so
redo the fill by hand if you regenerate them.

The Cisco CCNA Cybersecurity badge (`cisco-ccna-cybersecurity.webp`) ships on a plain
white square, and its lettering is dark too, so removing the white would leave it unreadable
on the dark theme. Its webp keeps the white as a card with rounded corners instead;
`scripts/badges.mjs` does not do this either, so redo it by hand if you regenerate it.
