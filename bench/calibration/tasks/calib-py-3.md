# Add a localized `medical` provider (blood groups, diagnoses, medications, facilities, practitioner identifiers)

## Summary

Healthcare software (EHRs, insurance claims, pharmacy, lab and scheduling
systems) is a large user of test data, and today every project invents its own
fake diagnoses and practitioner numbers. Faker should provide a `medical`
provider whose values look right per country and whose identifiers pass the
validation those systems perform.

## The provider

New localized provider `faker.providers.medical`:

| Method                    | Example (`en_US`)                                                    |
| ------------------------- | -------------------------------------------------------------------- |
| `blood_group()`           | `O+` (weighted by the locale's population frequency)                 |
| `diagnosis()`             | `Essential (primary) hypertension`                                   |
| `icd10_code()`            | `I10`                                                                |
| `icd10_diagnosis()`       | `("I10", "Essential (primary) hypertension")`                        |
| `medication()`            | `Lisinopril`                                                         |
| `dosage()`                | `20 mg`                                                              |
| `prescription()`          | `Lisinopril 20 mg, 1 tablet twice a day for 30 days`                 |
| `allergy()`               | `Penicillin`                                                         |
| `medical_specialty()`     | `Cardiology`                                                         |
| `medical_facility()`      | `St. Mary's Regional Medical Center`                                 |
| `practitioner_id()`       | locale identifier, see below                                         |
| `patient_record_number()` | `MRN-00482913`                                                       |
| `vital_signs()`           | dict: systolic/diastolic, pulse, temperature, SpO2, respiratory rate |

Data rules:

- ICD-10 codes and their (localized) descriptions come from one shared table of
  about 150 common codes across the chapters, so `icd10_code()` and
  `diagnosis()` are consistent; locales translate the descriptions.
- Medications are international non-proprietary names (INN) per locale
  spelling, with plausible strengths and dosage forms.
- `vital_signs()` returns physiologically plausible values; `abnormal=True`
  makes at least one value fall outside the normal range.

## Practitioner identifiers (with their check digits)

| Locale  | Identifier                                      | Check                                    |
| ------- | ----------------------------------------------- | ---------------------------------------- |
| `en_US` | NPI, 10 digits                                  | Luhn over `80840` + 9 digits             |
| `en_GB` | GMC reference number, 7 digits                  | none (range check)                       |
| `fr_FR` | RPPS, 11 digits                                 | Luhn                                     |
| `de_DE` | LANR, 9 digits                                  | LANR weighted modulo 10 on the 7th digit |
| `nl_NL` | BIG-nummer, 11 digits                           | none (format)                            |
| `es_ES` | número de colegiado, 9 digits (province prefix) | none (format)                            |
| `it_IT` | codice iscrizione albo, province + number       | none (format)                            |
| `pt_BR` | CRM, number + `/` + state (`CRM/SP 123456`)     | none (format)                            |

Validation helpers (`is_valid_npi()` etc.) are module-level functions so tests
and users can check generated values.

## Locales

`en_US`, `en_GB`, `fr_FR`, `de_DE`, `es_ES`, `it_IT`, `nl_NL`, `pt_BR`; each
with blood group frequencies, translated diagnoses, medication spellings,
specialties, facility name formats and the identifier above.

## Integration

- `profile()` takes `blood_group` from the new provider, so it follows the
  locale's frequencies instead of a uniform choice.
- `profile()` accepts the opt-in field names `allergies` (0–3 distinct),
  `medications` (0–4 prescription lines), `primary_care_physician`
  (`{"name", "practitioner_id"}`, a `PrimaryCarePhysician` TypedDict in
  `faker/typing.py`) and `medical_record_number`. They are only generated when
  named in `fields` (after the default fields), so the default output and its
  random sequence stay unchanged.
- Doctor titles belong to the `person` provider: new methods
  `prefix_medical()`, `prefix_medical_male()`, `prefix_medical_female()`,
  driven by `prefixes_medical_male` / `prefixes_medical_female` on the locale
  modules (fallback `Dr.`): `Dr. med.` (de_DE), `Dr` / `Prof` and `Mr` / `Ms`
  for surgeons (en_GB), `Dr` / `Pr` (fr_FR), `Dott.` / `Dott.ssa` (it_IT),
  `Dr.` / `Dra.` (es_ES, pt_BR), `dr.` / `prof. dr.` (nl_NL), and the regional
  variants and neighbouring locales that have a person module (de_AT, de_CH,
  fr_BE, fr_CA, fr_CH, es_AR, es_CO, es_MX, pt_PT, nl_BE, en_IE, en_NZ, cs_CZ,
  sk_SK, pl_PL, ro_RO).
- `practitioner_name(sex=None)` in the medical provider builds a titled name
  from those prefixes and the locale's gendered names (`sex` is `M`, `F`, `X`
  or `None`; anything else raises `ValueError`).
- `faker/proxy.pyi` regenerated with `generate_stubs.py`.

## Acceptance

- `tests/providers/test_medical.py`: every method for every locale, check-digit
  validation of the identifiers (including known-valid reference numbers),
  frequency sanity check of blood groups with a fixed seed, vital-sign ranges
  for normal and abnormal values.
- `tests/providers/test_profile.py` still passes, checks the blood group
  comes from the locale table and covers the opt-in medical fields in each
  medical locale; `tests/providers/test_person.py` covers the doctor titles.
- The full test suite, flake8, isort, black and mypy pass.
