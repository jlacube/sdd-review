# Public holidays per locale and business-day aware dates

## Summary

Scheduling, payroll, banking (settlement dates) and logistics systems all treat
public holidays and weekends specially, and their test suites need dates that
_are_ or _are not_ holidays or business days in a given country. Faker's
`date_time` provider has no notion of either. This request adds a localized
holiday calendar, a rule engine to compute it for any year, and business-day
aware date methods.

## 1. Rule engine (`faker/providers/holiday/rules.py`)

Holiday definitions are data, evaluated per year by a small rule engine:

- `FixedDate(month, day)` — e.g. 1 May;
- `NthWeekday(month, weekday, n)` — `n` may be negative (last Monday of May);
- `EasterOffset(days, calendar="western"|"orthodox")` — Easter Sunday is
  computed (anonymous Gregorian algorithm; Meeus' Julian algorithm converted to
  the Gregorian calendar for orthodox Easter);
- `WeekdayOnOrAfter(month, day, weekday)` / `WeekdayOnOrBefore(...)` (e.g.
  Midsummer Day in Sweden, Victoria Day in Canada);
- `Observed(rule, policy)` — weekend shifting: `nearest_weekday` (US federal),
  `next_monday` (UK substitute days), `none`;
- `since` / `until` years on every definition (e.g. Juneteenth from 2021, King's
  Day vs Queen's Day in the Netherlands).

A holiday definition has a stable key (`new_years_day`), a localized name and a
rule. Computation must be correct for 1900–2100 and is cached per (locale,
year).

## 2. `holiday` provider

New localized provider `faker.providers.holiday`:

| Method                     | Example (`en_US`)                        |
| -------------------------- | ---------------------------------------- |
| `holiday_name()`           | `Independence Day`                       |
| `holiday(year=None)`       | `("Independence Day", date(2019, 7, 4))` |
| `holidays(year)`           | ordered list of `(name, date)`           |
| `holiday_date(year=None)`  | `date(2011, 11, 24)`                     |
| `is_holiday(day)`          | `True`                                   |
| `next_holiday(after=None)` | `("Labor Day", date(2024, 9, 2))`        |

Locales (at least 14): `en_US`, `en_GB`, `en_CA`, `en_AU`, `de_DE`, `fr_FR`,
`es_ES`, `it_IT`, `nl_NL`, `pl_PL`, `pt_BR`, `sv_SE`, `ja_JP`, `el_GR`
(orthodox Easter). Regional holidays (German Länder, Canadian provinces,
Australian states, US states) are out of scope; national holidays only.
`ja_JP` substitute holidays (振替休日) follow the next-weekday rule.

## 3. Business days in `date_time`

New methods on the base `date_time` provider; they use the holiday calendar of
the generator's locale when the `holiday` provider is present, and weekends
only otherwise:

- `is_business_day(day) -> bool`;
- `business_date_between(start_date="-30y", end_date="today") -> date`;
- `business_date_this_month()`, `business_date_this_year()`;
- `add_business_days(day, n) -> date` (`n` may be negative);
- `business_days_between(start, end) -> int` (inclusive start, exclusive end);
- `weekend_date_between(start_date, end_date) -> date`.

Weekend days are configurable per locale (`weekend_days` class attribute on the
date_time locale provider; Friday/Saturday for `he_IL` and the Arabic
locales that have a date_time module). Existing date parsing (`-30y`, `today`,
`date`/`datetime` objects) is reused through the provider's existing helpers.
When there is no business day in the requested range, a `ValueError` is raised.

## Integration

- `faker/proxy.pyi` regenerated with `generate_stubs.py`.
- `faker/typing.py` gains the `HolidayRule` protocol used by the engine.

## Acceptance

- `tests/providers/test_holiday.py`: the rule engine (Easter dates checked
  against published tables for several years in both calendars; nth weekday;
  observed shifts across year boundaries), every locale's calendar for a few
  reference years against published lists, and each provider method.
- `tests/providers/test_date_time.py`: the business-day methods, including
  weekend configuration, negative `n`, empty ranges and locales without a
  holiday calendar.
- The full test suite, flake8, isort, black and mypy pass.
