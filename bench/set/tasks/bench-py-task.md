# Add PO box addresses and a localized `shipping` provider

## Summary

Faker can generate street addresses for dozens of locales, but nothing for the
other half of real-world mail: post office boxes, parcels and their tracking
data. Test fixtures for e-commerce checkouts, order management, warehouse and
customs systems currently hard-code carrier names and invent tracking numbers
that fail the check-digit validation those systems perform.

This request has three parts:

1. extend the existing `address` provider and its locale modules with post
   office box addresses;
2. add a new localized `shipping` provider for parcels, carriers and tracking
   numbers;
3. factor the check-digit arithmetic that several providers re-implement into
   shared helpers, and use them both in the new provider and in the existing
   ones.

## 1. PO boxes in the `address` provider

New methods on the base address provider:

| Method             | Example (`en_US`)                    |
| ------------------ | ------------------------------------ |
| `po_box()`         | `PO Box 4521`                        |
| `po_box_address()` | `PO Box 4521\nSpringfield, IL 62704` |

- Two new class attributes drive them: `po_box_formats` (parsed, then
  numerified; `%` for the leading digit so box numbers never start with 0) and
  `po_box_address_formats`.
- Every country locale of `address` gets its national convention, e.g.
  `Postfach 12 34 56` (de_DE), `BP 123` / `CS 12345` and `Cedex` (fr_FR),
  `Postbus 1234` (nl_NL), `Box 1234` (sv_SE), `Apartado de Correos 12`
  (es_ES), `Caixa Postal 1234` (pt_BR), `а/я 12` (ru_RU), `PO Box 1234 Stn
Main` / `C.P. 1234 succ. Centre-ville` (en_CA / fr_CA), `私書箱第12号`
  (ja_JP), `사서함 12호` (ko_KR), `邮政信箱123号` (zh_CN). The address line
  order follows the locale's existing `address_formats` (Hungarian puts the
  box between the city and the postcode, for example).
- `en_NZ` currently fakes a PO box street address with
  `"PO Box {{building_number}}"`; it should use `{{po_box}}` instead.

## 2. New `shipping` provider

A new localized provider, `faker.providers.shipping`:

| Method                                                            | Description                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shipping_carrier()`                                              | A carrier operating in the locale (national post plus the main couriers).                                                                                                |
| `shipping_method()`                                               | Service level (`Standard`, `Express`, `Next Day`, ...), translated.                                                                                                      |
| `delivery_status()`                                               | Tracking status (`In transit`, `Out for delivery`, `Delivered`, ...), translated.                                                                                        |
| `package_type()`                                                  | Envelope, padded envelope, box sizes, tube, pallet, translated.                                                                                                          |
| `tracking_number(service_indicator=None, country_code=None)`      | UPU S10 international item identifier such as `RR473124829GB` with a valid check digit; the country defaults to the locale's.                                            |
| `domestic_tracking_number()`                                      | A tracking number in a domestic carrier format of the locale.                                                                                                            |
| `sscc(extension_digit=None, company_prefix=None)`                 | 18-digit GS1 Serial Shipping Container Code with a valid check digit.                                                                                                    |
| `parcel_weight(min_weight=0.1, max_weight=30.0, unit=None)`       | e.g. `2.35 kg`; `kg`, `g`, `lb`, `oz`; locale default (`lb` for en_US).                                                                                                  |
| `parcel_dimensions(unit=None)`                                    | e.g. `40 x 30 x 12 cm`, sides sorted from longest; `cm`, `mm`, `in`.                                                                                                     |
| `estimated_delivery_date(ship_date=None, min_days=1, max_days=7)` | Business-day arithmetic that honours the locale's weekend (Friday/Saturday in most Arab countries and Israel, Friday in Iran, Saturday in Nepal).                        |
| `incoterm(sea_only=None, full_name=False)`                        | An Incoterms 2020 rule.                                                                                                                                                  |
| `hs_code(separator=".")`                                          | Six-digit Harmonized System code (`8471.30`).                                                                                                                            |
| `customs_declaration()`                                           | HS code, Incoterm, origin country, declared value and currency.                                                                                                          |
| `shipment(international=None)`                                    | A dict combining all of the above with a recipient name and address (sometimes a PO box address); international shipments carry an S10 number and a customs declaration. |

Locale requirements:

- Cover every country that already has a locale in Faker and a postal operator
  we can name with confidence (about 90 locales), with real carrier names and,
  where known, domestic tracking number formats.
- Translate service levels, statuses and package types. Locales of the same
  language should share their translations, but must not create language-only
  locales (`fr`, `nl`, ...) as a side effect: Faker treats every locale package
  of a localized provider as an available locale for all providers.
- `en_MS` describes Malaysia, so its S10 country code must be `MY`.
- Locales without a shipping module fall back to `en_US`, as for other
  providers.

## 3. Shared checksum helpers

Add to `faker/utils/checksums.py`: a weighted sum, a mod-10 weighted check
digit, the GS1 check digit, mod-11 remainder/complement helpers, the ISBN-10
check character and the UPU S10 check digit. Use them in the new provider and
replace the hand-rolled loops in the existing providers that compute the same
thing (barcode EAN/UPC, ISBN, SBN, automotive VIN, `pl_PL` REGON/NIP/PESEL,
`ru_RU` INN/SNILS, `no_NO`, `et_EE`, `es_CO` NIT, `pt_BR` CPF/CNPJ) without
changing any generated value.

## Acceptance criteria

- Every generated S10 number and SSCC passes check-digit validation; tests
  verify the check digits against published examples (`RR473124829GB`,
  GS1 SSCC `006141411234567890`, EAN-13 `4006381333931`, ...).
- Existing providers that move to the shared helpers keep their output; add
  regression tests with published identifiers (PESEL, NIP, REGON, INN, SNILS,
  CPF, CNPJ, NIT, VIN, ISBN, ...).
- Each new shipping locale has tests for its carriers, translations, S10
  country code, domestic tracking format and weekend where applicable; each
  localized PO box format is covered in `tests/providers/test_address.py`.
- `faker/proxy.pyi` is regenerated with `generate_stubs.py`.
- The full test suite, flake8, isort, black, mypy, doc8 and check-manifest
  pass.
