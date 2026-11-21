# Add a localized `education` provider and education fields in `profile()`

## Summary

Faker generates people, jobs and companies, but nothing about the schooling
behind them. HR, admissions, alumni and CV-parsing systems need fake schools,
degrees, fields of study, grades and graduation years that look right for the
locale (a French _Master_ with a mention, a German _Abitur_ grade of 1.7, a US
GPA of 3.42, a British upper-second-class honours degree).

## The provider

A new localized provider `faker.providers.education` with a base `Provider`
(English data, used as fallback) and these methods:

| Method                                    | Example (`en_US`)              |
| ----------------------------------------- | ------------------------------ |
| `school_name()`                           | `Lincoln High School`          |
| `university()`                            | `University of North Carolina` |
| `college()`                               | `Riverside Community College`  |
| `institution(level=None)`                 | one of the three, by level     |
| `field_of_study()`                        | `Mechanical Engineering`       |
| `degree(level=None)`                      | `Bachelor of Science`          |
| `degree_abbreviation(level=None)`         | `BSc`                          |
| `education_level()`                       | `bachelor`                     |
| `grade()`                                 | `3.42` (locale grading scale)  |
| `graduation_year(min_age=22, max_age=70)` | `2009`                         |
| `academic_title()`                        | `Dr.`                          |
| `education(level=None)`                   | dict, see below                |

- `level` is one of `secondary`, `vocational`, `associate`, `bachelor`,
  `master`, `doctorate` (an `EducationLevel` literal type in
  `faker/typing.py`); an unknown level raises `ValueError`.
- `education()` returns
  `{"level", "institution", "degree", "field_of_study", "grade",
"graduation_year"}`; for `secondary` there is no field of study (`None`).
- Institution names are built from formats (`{{city}} University`,
  `Université de {{city}}` …) mixed with a list of real-looking names, using the
  locale's `city()`/`last_name()` where the formats need them.
- Grades follow the locale scale: US 4.0 GPA, UK degree classifications,
  French note sur 20 with _mention_, German 1.0–4.0, Spanish 5–10, Italian
  66–110 _e lode_ for degrees.

## Locales

`en_US`, `en_GB`, `fr_FR`, `de_DE`, `es_ES` and `it_IT`, each with its own
institutions, degree names and abbreviations per level, fields of study and
grading scale. Other locales use the English base data.

## Integration

- `profile()` accepts the new field names `education` (the dict of
  `education()`) and `highest_degree` (the degree string). They are only
  generated when they are named in `fields`, so the default output of
  `profile()` and its random sequence stay unchanged.
- `faker/proxy.pyi` regenerated with `generate_stubs.py`.
- A short section in `docs/` is not needed: provider docs are generated.

## Acceptance

- `tests/providers/test_education.py` covers every method for the base
  provider and every locale (format of degrees, grade ranges per scale, years
  within bounds, `ValueError` for bad levels).
- `tests/providers/test_profile.py` covers the two new profile fields and
  checks that the default profile keys are unchanged.
- The full test suite, flake8, isort, black and mypy pass.
