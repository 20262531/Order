# Actual image OCR diagnostic

Tesseract CLI on the 10 uploaded photos. These results do not certify the browser Tesseract.js build. Text parsing fixtures and actual image recognition are different tests.

| Photo | Expected menu lines | PSM3 lines | PSM6 lines | Both passes agree on table/bill/items/modifiers |
|---|---:|---:|---:|---|
| S__58654731 | 2 | 2 | 2 | no — withhold automatic menu |
| 8474 | 4 | 1 | 4 | no — withhold automatic menu |
| 8477 | 1 | 0 | 0 | no — withhold automatic menu |
| S__58654735 | 1 | 1 | 1 | yes (not proof of correctness) |
| S__5210126 | 5 | 1 | 3 | no — withhold automatic menu |
| S__18309128 | 2 | 1 | 1 | no — withhold automatic menu |
| S__58654749 | 2 | 1 | 1 | no — withhold automatic menu |
| S__18309135 | 5 | 0 | 5 | no — withhold automatic menu |
| S__58654727 | 2 | 0 | 0 | no — withhold automatic menu |
| S__58654729 | 1 | 1 | 1 | yes (not proof of correctness) |

Do not infer accuracy from equal item counts. This is a diagnostic for failure modes, not an independent held-out accuracy benchmark. Confidence=100 was supplied only to isolate cross-pass/metadata validation in this table; real browser code uses OCR confidence.

Implemented: dual-pass agreement, confidence floor, missing table/bill block, allergy treated as modifier, legacy garbage-item quarantine, manual reread replacement with concurrent-change guard.

Still absent: real AI vision extraction endpoint, server secret configuration, menu-master matching, image perspective correction and handwritten-note validation. Two OCR passes can agree on the same mistake.
