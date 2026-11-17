---
id: "C001-CAP-02"
artifact: spec/acceptance
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Architecture delta"
---
# C001-CAP-02 — Acceptance criteria and scenarios

Requirements: `requirements.md`. Terms: `40-domain/glossary-delta.md`. The fixture conventions of
`../CAP-01-change-intake/acceptance.md` apply (commit labels, headless output, model-free default,
`stub-llm`).

**Fixture repositories of this file:**
- `fx-shop-ts`, `fx-shop-py`, `fx-shop-cs`: one repository per deep ecosystem (TypeScript, Python,
  C#) with the source folders `cart`, `billing`, `orders` and `catalog`, and no documented
  architecture.
- `fx-shop-doc`: the TypeScript repository with a documented architecture in its `.sdd/` workspace:
  components Web (`src/web/**`), Checkout (`src/checkout/**`), Cart (`src/cart/**`), Pricing
  (`src/pricing/**`), Billing (`src/billing/**`), Orders (`src/orders/**`) and Catalog
  (`src/catalog/**`); layers from top to bottom "ui" (Web), "application" (Checkout, Cart, Orders)
  and "domain" (Pricing, Billing, Catalog); allowed dependencies Web to Checkout, Checkout to Cart,
  Cart to Billing, Cart to Catalog, Orders to Billing.
- `fx-sdd-nopaths` and `fx-neutral-nopaths`: a `.sdd/` workspace with the open SDD change "CHG-042"
  in `.sdd/042-cart/`, and a neutral intent-and-architecture file, each holding an architecture
  whose components "Api" and "Ui" have neither a `**Paths:**` bullet nor an evidence path; the
  changed files lie under `server/` and `client/`.

## C001-REQ-201

#### C001-AC-201.1 — The review opens on the architecture delta once static analysis completes
```gherkin
Scenario: C001-TS-201 — A new review opens on the architecture delta
  Given the fixture repository "fx-shop-ts" with a change of 14 changed files since B0
  When the developer starts a review naming commit B0
  Then the first view the review UI shows is the architecture delta of the new snapshot
```
```gherkin
Scenario: C001-TS-202 — The architecture delta does not wait for model output
  Given `stub-llm` is configured as the model provider of "fx-shop-ts" and delays every answer by 60 s
  When the developer starts a review naming commit B0
  Then the review UI shows the architecture delta of the new snapshot
  And at that moment `stub-llm` has answered 0 requests
```
```gherkin
Scenario: C001-TS-203 — A reopened review opens on the architecture delta
  Given a review of snapshot S1 of "fx-shop-ts" whose last view in the previous review session was the intent "Add cart totals"
  When the developer reopens the review of S1
  Then the first view the review UI shows is the architecture delta of S1
```

## C001-REQ-202

#### C001-AC-202.1 — Every changed file belongs to exactly one component
```gherkin
Scenario: C001-TS-204 — 40 changed files are each placed once
  Given the fixture repository "fx-shop-ts" with 40 changed files since B0: 12 in "src/cart", 9 in "src/billing", 6 in "src/orders", 12 in "test" and "README.md"
  When the developer starts a review naming commit B0
  Then the architecture delta in the headless output assigns each of the 40 changed files to exactly one component
  And the changed-file counts of all components add up to 40
```
```gherkin
Scenario: C001-TS-205 — A file renamed across folders is placed once
  Given the fixture repository "fx-shop-ts" where the change renames "src/cart/price.ts" to "src/billing/price.ts"
  When the developer starts a review naming commit B0
  Then the architecture delta in the headless output assigns the renamed file to exactly one component
```
```gherkin
Scenario: C001-TS-206 — A deleted file whose folder no longer exists is placed once
  Given the fixture repository "fx-shop-ts" where the change deletes "src/legacy/old.ts", the only file of "src/legacy"
  When the developer starts a review naming commit B0
  Then the architecture delta in the headless output assigns "src/legacy/old.ts" to exactly one component
```

## C001-REQ-203

#### C001-AC-203.1 — Each touched component states its changed files, changed lines, hunks and layer
```gherkin
Scenario: C001-TS-207 — Amount of change per component
  Given the fixture repository "fx-shop-doc" where the change touches Cart with 3 files, 120 changed lines and 7 hunks, and Orders with 1 file, 8 changed lines and 2 hunks
  When the developer starts a review naming commit B0
  Then the architecture delta states for Cart 3 changed files, 120 changed lines and 7 hunks
  And it states for Orders 1 changed file, 8 changed lines and 2 hunks
  And it lists no other component as touched
```
```gherkin
Scenario: C001-TS-208 — The layer of each component is stated when the documented architecture defines layers
  Given the fixture repository "fx-shop-doc" where the change touches Web and Pricing
  When the developer starts a review naming commit B0
  Then the architecture delta states the layer "ui" for Web and the layer "domain" for Pricing
```
```gherkin
Scenario: C001-TS-209 — No layer is stated without a documented architecture
  Given the fixture repository "fx-shop-ts" where the change touches "src/cart" and "src/billing"
  When the developer starts a review naming commit B0
  Then the architecture delta states no layer for any component
```

## C001-REQ-204

#### C001-AC-204.1 — Dependencies between components that the change adds or removes are listed with their hunks
```gherkin
Scenario: C001-TS-210 — An added and a removed dependency
  Given the fixture repository "fx-shop-doc" in which Cart does not depend on Billing at B0
  And the change adds the line `import { tax } from "../billing/tax";` in hunk H1 of "src/cart/total.ts"
  And the change removes, in hunk H2 of "src/cart/view.ts", the only import from Cart to Catalog
  When the developer starts a review naming commit B0
  Then the architecture delta lists the dependency Cart to Billing as added, marked as a new coupling, with the hunk H1
  And it lists the dependency Cart to Catalog as removed with the hunk H2
```
```gherkin
Scenario Outline: C001-TS-211 — Import and reference statements of each deep ecosystem add dependencies
  Given the fixture repository "<repo>" in which the cart component does not depend on the billing component at B0
  And the change adds <statement> in hunk H1 of "<file>"
  When the developer starts a review naming commit B0
  Then the architecture delta lists the dependency from the cart component to the billing component as added, marked as a new coupling, with the hunk H1

  Examples:
    | repo       | file                              | statement                                                      |
    | fx-shop-ts | src/cart/total.ts                 | `import { tax } from "../billing/tax";`                        |
    | fx-shop-py | shop/cart/total.py                | `from shop.billing import tax`                                 |
    | fx-shop-cs | src/Shop.Cart/Shop.Cart.csproj    | a ProjectReference to "../Shop.Billing/Shop.Billing.csproj"    |
```
```gherkin
Scenario: C001-TS-212 — A further import along an existing dependency adds no dependency
  Given the fixture repository "fx-shop-doc" in which Cart already depends on Billing at B0
  And the change adds the line `import { rate } from "../billing/rate";` in "src/cart/total.ts"
  When the developer starts a review naming commit B0
  Then the architecture delta lists no added dependency from Cart to Billing
```

## C001-REQ-205

#### C001-AC-205.1 — External packages added, removed or re-versioned in a package manifest are listed with their hunk
```gherkin
Scenario Outline: C001-TS-213 — Package changes of each deep-ecosystem manifest are listed
  Given the fixture repository "<repo>" where hunk H1 of "<manifest>" <edit>
  When the developer starts a review naming commit B0
  Then the architecture delta lists the external package "<package>" as <outcome> with the hunk H1

  Examples:
    | repo       | manifest                         | edit                                                      | package         | outcome                           |
    | fx-shop-ts | package.json                     | adds the dependency "zod" at "3.23.8"                     | zod             | added at 3.23.8                   |
    | fx-shop-py | pyproject.toml                   | changes "requests" from "2.31.0" to "2.32.3"              | requests        | re-versioned from 2.31.0 to 2.32.3 |
    | fx-shop-py | requirements-dev.txt             | removes the line "pytest-mock==3.12.0"                    | pytest-mock     | removed                           |
    | fx-shop-cs | src/Shop.Cart/Shop.Cart.csproj   | adds a PackageReference to "Serilog" at "3.1.1"           | Serilog         | added at 3.1.1                    |
    | fx-shop-cs | Directory.Packages.props         | changes "Newtonsoft.Json" from "13.0.1" to "13.0.3"       | Newtonsoft.Json | re-versioned from 13.0.1 to 13.0.3 |
```
```gherkin
Scenario: C001-TS-214 — A manifest edit that touches no package lists no package
  Given the fixture repository "fx-shop-ts" where the change edits only the "scripts" section of "package.json"
  When the developer starts a review naming commit B0
  Then the architecture delta lists no external package
```

## C001-REQ-206

#### C001-AC-206.1 — New couplings carry a "new coupling" label that existing dependencies do not carry
```gherkin
Scenario: C001-TS-215 — Only the new dependency is labelled
  Given the fixture repository "fx-shop-doc" in which Cart depends on Catalog at B0 and not on Billing
  And the change adds an import from Cart to Billing and a further import from Cart to Catalog
  When the developer opens the architecture delta in the review UI
  Then the dependency Cart to Billing is shown with the label "new coupling"
  And the dependency Cart to Catalog is shown without the label "new coupling"
```

## C001-REQ-207

#### C001-AC-207.1 — Components, layers and allowed dependencies come from the documented architecture
```gherkin
Scenario: C001-TS-216 — The `.sdd/` documented architecture names the components
  Given the fixture repository "fx-shop-doc" where the change touches "src/cart/total.ts" and "src/pricing/rules.ts"
  When the developer starts a review naming commit B0
  Then the architecture delta places "src/cart/total.ts" in the component "Cart" of layer "application"
  And it places "src/pricing/rules.ts" in the component "Pricing" of layer "domain"
```
```gherkin
Scenario: C001-TS-217 — A neutral intent-and-architecture file names the components
  Given the fixture repository "fx-neutral" whose snapshot holds a neutral intent-and-architecture file declaring the components "Api" for "server/**" and "Ui" for "client/**", the layers "edge" (Ui) and "core" (Api), and the allowed dependency Ui to Api
  And the change touches "server/routes.ts" and "client/app.ts"
  When the developer starts a review naming commit B0
  Then the architecture delta places "server/routes.ts" in the component "Api" of layer "core"
  And it places "client/app.ts" in the component "Ui" of layer "edge"
```

## C001-REQ-208

#### C001-AC-208.1 — Added dependencies that the documented architecture does not allow are flagged as drift
```gherkin
Scenario: C001-TS-218 — A disallowed new dependency is drift
  Given the fixture repository "fx-shop-doc", which does not allow Cart to depend on Orders
  And the change adds an import from Cart to Orders in hunk H1 of "src/cart/total.ts"
  When the developer starts a review naming commit B0
  Then the architecture delta flags the dependency Cart to Orders as drift with the hunk H1
```
```gherkin
Scenario: C001-TS-219 — An allowed new dependency is not drift
  Given the fixture repository "fx-shop-doc", which allows Cart to depend on Billing, and Cart does not depend on Billing at B0
  And the change adds an import from Cart to Billing
  When the developer starts a review naming commit B0
  Then the architecture delta flags no drift
```
```gherkin
Scenario: C001-TS-220 — Removing a disallowed dependency is not drift
  Given the fixture repository "fx-shop-doc" in which Cart depends on Orders at B0, which the documented architecture does not allow
  And the change removes the only import from Cart to Orders
  When the developer starts a review naming commit B0
  Then the architecture delta flags no drift
```

## C001-REQ-209

#### C001-AC-209.1 — Changed files outside every documented component are drift in the component "Undocumented"
```gherkin
Scenario: C001-TS-221 — A file outside the documented components
  Given the fixture repository "fx-shop-doc" where the change adds "scripts/seed.ts", which no documented component contains
  When the developer starts a review naming commit B0
  Then the architecture delta flags "scripts/seed.ts" as drift
  And it places "scripts/seed.ts" in the component "Undocumented"
```
```gherkin
Scenario: C001-TS-222 — A new file inside a documented component is not drift
  Given the fixture repository "fx-shop-doc" where the change adds "src/cart/coupon.ts" and no import
  When the developer starts a review naming commit B0
  Then the architecture delta places "src/cart/coupon.ts" in the component "Cart"
  And it flags no drift
```

## C001-REQ-210

#### C001-AC-210.1 — Without a documented architecture, components and dependencies are derived from the repository structure
```gherkin
Scenario Outline: C001-TS-223 — Components derived from the structure of each deep ecosystem
  Given the fixture repository "<repo>" with no documented architecture and the structural units <unit a> and <unit b>
  And the change adds <statement> in hunk H1
  When the developer starts a review naming commit B0
  Then the architecture delta holds one derived component with the changed files of <unit a> and another with the changed files of <unit b>
  And it lists the dependency from the component of <unit a> to the component of <unit b> as added with the hunk H1

  Examples:
    | repo       | unit a                                       | unit b                                        | statement                                                                        |
    | fx-shop-ts | the workspace package "packages/web"         | the workspace package "packages/api"          | `import { getCart } from "@shop/api";` in "packages/web/src/client.ts"           |
    | fx-shop-py | the package "shop/cart" with "__init__.py"   | the package "shop/billing" with "__init__.py" | `from shop.billing import tax` in "shop/cart/total.py"                            |
    | fx-shop-cs | the project "Shop.Cart.csproj"               | the project "Shop.Billing.csproj"             | a ProjectReference to "Shop.Billing.csproj" in "Shop.Cart.csproj"                 |
```

## C001-REQ-211

#### C001-AC-211.1 — Without a documented architecture in the sources read, the view states that drift was not checked
```gherkin
Scenario: C001-TS-224 — The drift statement is shown
  Given the fixture repository "fx-shop-ts" with no documented architecture
  When the developer opens the architecture delta in the review UI
  Then the view states that drift was not checked because no documented architecture was found in the sources that the review reads it from
```
```gherkin
Scenario Outline: C001-TS-260 — An architecture held outside the documented-architecture source order is not read and the statement says so
  Given the fixture repository "fx-sdd" whose snapshot holds no neutral intent-and-architecture file and the open SDD change "CHG-042" in ".sdd/042-cart/" without "10-spec/60-architecture/architecture.md"
  And "CHG-042" is the SDD change named at intake
  And the snapshot holds <place> an "architecture.md" whose components have path patterns covering every changed file
  When the developer opens the architecture delta in the review UI
  Then the view states that drift was not checked because no documented architecture was found in the sources that the review reads it from
  And the architecture delta holds components derived from the repository's structure and flags no drift

  Examples:
    | place                                                                 |
    | in the archived SDD change folder ".sdd/_archive/041-catalog/10-spec/60-architecture/" |
    | in the folder ".sdd/043-promo/10-spec/60-architecture/" of the open SDD change "CHG-043" |
```
```gherkin
Scenario: C001-TS-225 — No drift statement with a documented architecture
  Given the fixture repository "fx-shop-doc"
  When the developer opens the architecture delta in the review UI
  Then the view does not state that drift was not checked
```

## C001-REQ-212

#### C001-AC-212.1 — Files outside the deep ecosystems get their directory's component and unanalysed dependencies as a reduced result
```gherkin
Scenario: C001-TS-226 — A Ruby file is placed by directory
  Given the fixture repository "fx-shop-ts" where the change adds "tools/report.rb" with the line `require_relative "../lib/format"`
  When the developer starts a review naming commit B0
  Then the architecture delta places "tools/report.rb" in the component of the directory "tools"
  And it labels the dependencies of "tools/report.rb" as not analysed
  And it labels that placement as a reduced result
```
```gherkin
Scenario: C001-TS-227 — Analysed and unanalysed files in one directory
  Given the fixture repository "fx-shop-ts" where the change edits "src/cart/total.ts" with an added import from "src/billing" and adds "src/cart/legacy.lua"
  When the developer starts a review naming commit B0
  Then the architecture delta places "src/cart/legacy.lua" in the component of "src/cart" and labels its dependencies as not analysed
  And it lists the dependency from the component of "src/cart" to the component of "src/billing" without the label "not analysed"
```
```gherkin
Scenario Outline: C001-TS-248 — With a documented architecture a file outside the deep ecosystems is placed by its path patterns
  Given the fixture repository "fx-shop-doc" where the change adds "<file>" with the line `require_relative "../lib/format"`
  When the developer starts a review naming commit B0
  Then the architecture delta places "<file>" in the component "<component>"
  And it labels the dependencies of "<file>" as not analysed, as a reduced result

  Examples:
    | file                 | component    |
    | src/cart/report.rb   | Cart         |
    | tools/report.rb      | Undocumented |
```

## C001-REQ-213

#### C001-AC-213.1 — Dependency cycles that exist in the snapshot and not at the base commit are reported
```gherkin
Scenario: C001-TS-228 — A new two-component cycle
  Given the fixture repository "fx-shop-ts" in which "src/cart" depends on "src/billing" at B0
  And the change adds an import from "src/billing/invoice.ts" to "src/cart/total.ts"
  When the developer starts a review naming commit B0
  Then the design-quality findings hold one dependency cycle through the components of "src/cart" and "src/billing"
```
```gherkin
Scenario: C001-TS-229 — A cycle present at the base commit is not reported
  Given the fixture repository "fx-shop-ts" in which "src/cart" and "src/billing" depend on each other at B0
  And the change adds a further import from "src/billing/refund.ts" to "src/cart/total.ts"
  When the developer starts a review naming commit B0
  Then the design-quality findings hold no dependency cycle
```
```gherkin
Scenario: C001-TS-230 — A new three-component cycle
  Given the fixture repository "fx-shop-ts" in which "src/orders" depends on "src/billing" and "src/billing" depends on "src/cart" at B0
  And the change adds an import from "src/cart/total.ts" to "src/orders/order.ts"
  When the developer starts a review naming commit B0
  Then the design-quality findings hold one dependency cycle through the components of "src/cart", "src/orders" and "src/billing"
```

## C001-REQ-214

#### C001-AC-214.1 — Added dependencies to a component more than one layer below are reported as layer bypasses
```gherkin
Scenario: C001-TS-231 — Ui to domain skips the application layer
  Given the fixture repository "fx-shop-doc"
  And the change adds an import from Web to Pricing in hunk H1 of "src/web/cart-page.ts"
  When the developer starts a review naming commit B0
  Then the design-quality findings hold one layer bypass from Web to Pricing pointing to the hunk H1
```
```gherkin
Scenario: C001-TS-232 — A dependency one layer down is not a bypass
  Given the fixture repository "fx-shop-doc" in which Web does not depend on Checkout at B0
  And the change adds an import from Web to Checkout
  When the developer starts a review naming commit B0
  Then the design-quality findings hold no layer bypass
```
```gherkin
Scenario: C001-TS-233 — No layer bypass is reported when the documented architecture defines no layers
  Given the fixture repository "fx-shop-doc-nolayers", equal to "fx-shop-doc" except that its documented architecture defines no layers
  And the change adds an import from Web to Pricing
  When the developer starts a review naming commit B0
  Then the design-quality findings hold no layer bypass
```

## C001-REQ-215

#### C001-AC-215.1 — Added runs of lines that repeat other lines of the snapshot for at least the minimum clone length are reported
```gherkin
Scenario: C001-TS-234 — An 8-line copy is duplicated logic
  Given the fixture repository "fx-shop-ts" whose review configuration at B0 sets the minimum clone length to 6 lines
  And the change adds in hunk H1 of "src/cart/discount.ts" 8 lines identical to lines 20 to 27 of the unchanged file "src/orders/discount.ts"
  When the developer starts a review naming commit B0
  Then the design-quality findings hold one duplicated-logic finding pointing to the hunk H1
```
```gherkin
Scenario Outline: C001-TS-235 — The minimum clone length is the threshold
  Given the fixture repository "fx-shop-ts" whose review configuration at B0 sets the minimum clone length to 6 lines
  And the change adds in "src/cart/discount.ts" <n> lines identical to <n> consecutive lines of "src/orders/discount.ts", surrounded by lines found nowhere else
  When the developer starts a review naming commit B0
  Then the design-quality findings hold <count> duplicated-logic findings

  Examples:
    | n | count |
    | 6 | 1     |
    | 5 | 0     |
```
```gherkin
Scenario: C001-TS-236 — Copies that differ only in whitespace are duplicated logic
  Given the fixture repository "fx-shop-ts" whose review configuration at B0 sets the minimum clone length to 6 lines
  And the change adds in hunk H1 of "src/cart/discount.ts" 7 lines that equal lines 40 to 46 of "src/orders/discount.ts" except for tab instead of 4-space indentation and trailing spaces
  When the developer starts a review naming commit B0
  Then the design-quality findings hold one duplicated-logic finding pointing to the hunk H1
```

## C001-REQ-216

#### C001-AC-216.1 — With a model provider, its design critique joins the findings marked as model output
```gherkin
Scenario: C001-TS-237 — A design critique item from the provider
  Given `stub-llm` is configured as the model provider of "fx-shop-ts"
  And `stub-llm` is scripted to answer the design critique "computeTotal mixes tax and discount rules" for hunk H5 of "src/cart/total.ts"
  When the developer starts a review naming commit B0
  Then the design-quality findings hold a design critique item "computeTotal mixes tax and discount rules" pointing to H5
  And the item is marked as model output naming the provider "stub-llm" and the model "stub-model-1"
```

## C001-REQ-217

#### C001-AC-217.1 — Hunks that a deterministic design-quality finding points to stay open whatever their evidence
```gherkin
Scenario Outline: C001-TS-238 — Passing tests do not clear a hunk with a deterministic finding
  Given the fixture repository "fx-shop-doc" whose test command passes
  And hunk H1 has 6 executable lines, each executed by 4 passing qualifying tests, and no surviving mutant
  And a <kind> finding points to H1
  When the developer starts a review naming commit B0
  Then H1 is an open hunk

  Examples:
    | kind             |
    | dependency cycle |
    | layer bypass     |
    | duplicated logic |
```
```gherkin
Scenario: C001-TS-239 — A generated file does not clear a hunk with duplicated logic
  Given the fixture repository "fx-shop-ts" whose review configuration at B0 sets the generated-file pattern "src/gen/**" and the minimum clone length to 6 lines
  And hunk G1 of "src/gen/client.ts" adds 10 lines identical to lines 1 to 10 of "src/api/client.ts"
  When the developer starts a review naming commit B0
  Then G1 is an open hunk
```
```gherkin
Scenario: C001-TS-249 — A design critique item alone does not hold a hunk open
  Given `stub-llm` is configured as the model provider of "fx-shop-ts", whose test command passes
  And hunk H1 of "src/cart/total.ts" lies in no guarded area and has 6 executable lines, each executed by 4 passing qualifying tests, and no surviving mutant
  And `stub-llm` is scripted to answer the design critique "computeTotal mixes tax and discount rules" for H1, and no other design-quality finding points to H1
  When the developer starts a review naming commit B0
  Then H1 is cleared by test evidence
  And the design-quality findings still hold the design critique item pointing to H1
```

## C001-REQ-218

#### C001-AC-218.1 — The architecture delta view lists every design-quality finding with kind, component and hunks
```gherkin
Scenario: C001-TS-240 — Five findings of four kinds are listed
  Given `stub-llm` is configured as the model provider of "fx-shop-doc" and answers 1 design critique item
  And the change produces 1 dependency cycle, 1 layer bypass and 2 duplicated-logic findings
  When the developer opens the architecture delta in the review UI
  Then the view lists 5 design-quality findings
  And each of them is listed with its kind, every component it involves and the hunks it points to
```
```gherkin
Scenario Outline: C001-TS-250 — Each kind of finding lists every component it involves
  Given `stub-llm` is configured as the model provider of "fx-shop-doc"
  And the change produces <finding>
  When the developer opens the architecture delta in the review UI
  Then the view lists that finding with the components <components> and no other component

  Examples:
    | finding                                                                                                   | components               |
    | a new dependency cycle Cart to Billing to Orders to Cart                                                  | Cart, Billing and Orders |
    | a layer bypass from Web to Pricing                                                                        | Web and Pricing          |
    | a duplicated-logic finding pointing to added hunks of "src/cart/discount.ts" and "src/orders/discount.ts" | Cart and Orders          |
    | a design critique item pointing to hunk H5 of "src/pricing/rules.ts"                                      | Pricing                  |
```
```gherkin
Scenario: C001-TS-241 — A change without findings lists none
  Given the fixture repository "fx-shop-ts" where the change adds no dependency, no copied lines and no layer crossing
  When the developer opens the architecture delta in the review UI
  Then the view lists 0 design-quality findings
```

## C001-REQ-219

#### C001-AC-219.1 — In model-free mode the findings list is labelled as a reduced result without design critique
```gherkin
Scenario Outline: C001-TS-242 — Each cause of model-free mode labels the findings list
  Given the fixture repository "fx-shop-ts" where <state>
  When the developer opens the architecture delta in the review UI
  Then the list of design-quality findings is labelled as a reduced result that contains no design critique

  Examples:
    | state                                                                                       |
    | no model provider is configured                                                             |
    | a cloud provider is configured and the cloud opt-in setting is missing                      |
    | `stub-llm` is configured and refuses every connection                                       |
```
```gherkin
Scenario: C001-TS-243 — An answering provider removes the label
  Given `stub-llm` is configured as the model provider of "fx-shop-ts" and answers every request
  When the developer opens the architecture delta in the review UI
  Then the list of design-quality findings carries no reduced-result label
```

## C001-REQ-220

#### C001-AC-220.1 — Selecting a component lists its intents with code and its open hunks
```gherkin
Scenario: C001-TS-244 — Intents and open hunks of Cart
  Given a review of "fx-shop-doc" in which Cart holds 5 hunks: 2 of the intent "C042-REQ-003" and 1 of "C042-REQ-005" open, 2 of "C042-REQ-005" cleared
  And the intent "C042-REQ-004" has hunks in Billing only
  When the developer selects the component Cart in the architecture delta
  Then the review UI lists the intents "C042-REQ-003" and "C042-REQ-005" and not "C042-REQ-004"
  And it lists the 3 open hunks of Cart and none of its 2 cleared hunks
```
```gherkin
Scenario: C001-TS-245 — A component without open hunks still lists its intents
  Given a review of "fx-shop-doc" in which every hunk of Orders belongs to the intent "C042-REQ-006" and is cleared or read
  When the developer selects the component Orders in the architecture delta
  Then the review UI lists the intent "C042-REQ-006"
  And it lists 0 open hunks
```

## C001-REQ-221

#### C001-AC-221.1 — Unmet intents are reachable from the architecture delta
```gherkin
Scenario: C001-TS-246 — Two unmet intents under the entry for intents with no code
  Given a review of "fx-shop-doc" whose intents "C042-REQ-007" and "C042-REQ-008" have no hunk
  When the developer opens the architecture delta in the review UI
  Then the entry for intents with no code lists "C042-REQ-007" and "C042-REQ-008"
```
```gherkin
Scenario: C001-TS-247 — No unmet intent
  Given a review of "fx-shop-doc" in which every intent has at least one hunk
  When the developer opens the architecture delta in the review UI
  Then the entry for intents with no code lists 0 intents
```

## C001-REQ-222

#### C001-AC-222.1 — Hunks that add or delete lines from which the documented architecture is read are drift of the kind architecture edit
```gherkin
Scenario: C001-TS-251 — A component added by a spec-driven change is used and its hunk is flagged
  Given the fixture repository "fx-shop-doc" where hunk A1 of the architecture file of its `.sdd/` workspace adds the component "Coupons" with the bullet `**Paths:**` `src/coupons/**`
  And the change adds "src/coupons/code.ts"
  When the developer starts a review naming commit B0
  Then the architecture delta places "src/coupons/code.ts" in the component "Coupons"
  And it flags the hunk A1 as drift of the kind architecture edit
```
```gherkin
Scenario: C001-TS-252 — A change that allows its own dependency is flagged as an architecture edit
  Given the fixture repository "fx-shop-doc", whose documented architecture at B0 does not allow Cart to depend on Orders
  And hunk A2 of the architecture file adds Orders to the `**Depends on:**` bullet of the component Cart
  And hunk H1 of "src/cart/total.ts" adds an import from Cart to Orders
  When the developer starts a review naming commit B0
  Then the architecture delta flags the hunk A2 as drift of the kind architecture edit
  And it does not flag the dependency Cart to Orders as drift
```
```gherkin
Scenario: C001-TS-253 — An edit of the architecture of a neutral file is flagged
  Given the fixture repository "fx-neutral" where hunk A3 of ".sdd-review/workspace.json" adds the allowed dependency Api to Ui to its architecture
  When the developer starts a review naming commit B0
  Then the architecture delta flags the hunk A3 as drift of the kind architecture edit
```
```gherkin
Scenario: C001-TS-254 — Deleting the documented architecture is flagged and drift is stated as not checked
  Given the fixture repository "fx-shop-doc" where hunk A4 deletes every line of the architecture file of its `.sdd/` workspace
  When the developer starts a review naming commit B0
  Then the architecture delta flags the hunk A4 as drift of the kind architecture edit
  And the architecture delta view states that drift was not checked because no documented architecture was found
```
```gherkin
Scenario: C001-TS-255 — An edit of a line the architecture is not read from is not flagged
  Given the fixture repository "fx-shop-doc" where hunk A5 of the architecture file changes one sentence of its overview section, outside "## 2. Component catalogue"
  When the developer starts a review naming commit B0
  Then the architecture delta flags no drift of the kind architecture edit
```

## C001-REQ-223

#### C001-AC-223.1 — An architecture with no component path pattern raises a notice naming its file
```gherkin
Scenario Outline: C001-TS-256 — Components without path patterns are not a documented architecture
  Given the fixture repository "<repo>" whose snapshot holds in "<file>" an architecture with the components "Api" and "Ui", neither with a path pattern nor with an evidence path
  When the developer starts a review naming commit B0
  Then intake reports the notice ERR-SDD-004 that names "<file>" and states that the components are derived from the repository's structure
  And the architecture delta holds derived components and no component "Api" or "Ui"
  And the architecture delta view states that drift was not checked

  Examples:
    | repo               | file                                                         |
    | fx-neutral-nopaths | .sdd-review/workspace.json                                   |
    | fx-sdd-nopaths     | .sdd/042-cart/10-spec/60-architecture/architecture.md        |
```
```gherkin
Scenario: C001-TS-257 — One component with a path pattern makes the architecture documented
  Given the fixture repository "fx-sdd-nopaths" where the component "Api" of ".sdd/042-cart/10-spec/60-architecture/architecture.md" gains the bullet `**Paths:**` `server/**` and "Ui" keeps none
  When the developer starts a review naming commit B0
  Then intake reports no notice ERR-SDD-004
  And the architecture delta places the changed files under "server/" in the component "Api"
```

## C001-REQ-224

#### C001-AC-224.1 — Package changes of a manifest that cannot be parsed are labelled not analysed
```gherkin
Scenario Outline: C001-TS-258 — A manifest unparsable on one side labels its package changes
  Given the fixture repository "<repo>" where hunk H1 edits "<manifest>"
  And "<manifest>" cannot be parsed <side> because <fault>
  When the developer starts a review naming commit B0
  Then the architecture delta labels the external package changes of "<manifest>" as not analysed, as a reduced result
  And the label names "<manifest>" and the parse error
  And the architecture delta lists no external package from "<manifest>"

  Examples:
    | repo       | manifest       | side                | fault                                          |
    | fx-shop-ts | package.json   | in the snapshot     | the hunk H1 leaves a trailing comma after the last entry of "dependencies" |
    | fx-shop-py | pyproject.toml | at the base commit  | line 7 at B0 holds the unterminated string `version = "2.31` |
```
```gherkin
Scenario: C001-TS-259 — A parsable manifest of the same change is still analysed
  Given the fixture repository "fx-shop-ts" where the change breaks the JSON of "packages/web/package.json" and adds the dependency "zod" at "3.23.8" in hunk H2 of "packages/api/package.json"
  When the developer starts a review naming commit B0
  Then the architecture delta labels the package changes of "packages/web/package.json" as not analysed
  And it lists the external package "zod" as added at 3.23.8 with the hunk H2 without the label "not analysed"
```

## Coverage table

| REQ | happy | alternate | boundary | error | authorization | concurrency/idempotency | abuse |
|---|---|---|---|---|---|---|---|
| C001-REQ-201 | TS-201 | TS-202, TS-203 | n/a: the view is either the first one or not | n/a: intake errors stop the review before analysis (C001-CAP-01) | n/a | n/a | n/a |
| C001-REQ-202 | TS-204 | TS-205 | TS-206 | n/a | n/a | n/a | n/a |
| C001-REQ-203 | TS-207 | TS-208 | TS-209 | n/a | n/a | n/a | n/a |
| C001-REQ-204 | TS-210 | TS-211 | TS-212 | n/a | n/a | n/a | n/a |
| C001-REQ-205 | TS-213 | TS-213 | TS-214 | TS-258 (unparsable manifest: C001-REQ-224) | n/a | n/a | n/a |
| C001-REQ-206 | TS-215 | n/a: one label rule | TS-215 | n/a | n/a | n/a | n/a |
| C001-REQ-207 | TS-216 | TS-217 | TS-256 (no component path: C001-REQ-223) | TS-256; damaged `.sdd/` entries and invalid neutral files: C001-REQ-123, C001-REQ-124 in `CAP-01-change-intake/acceptance.md` | n/a | n/a | TS-252 (edits of the documented architecture: C001-REQ-222) |
| C001-REQ-208 | TS-218 | TS-220 | TS-219 | n/a | n/a | n/a | n/a |
| C001-REQ-209 | TS-221 | n/a: one placement rule | TS-222 | n/a | n/a | n/a | n/a |
| C001-REQ-210 | TS-223 | TS-223 | n/a: every changed file lies in some directory | n/a | n/a | n/a | n/a |
| C001-REQ-211 | TS-224 | TS-260 | TS-225 | n/a | n/a | n/a | n/a |
| C001-REQ-212 | TS-226 | TS-227, TS-248 | TS-227, TS-248 | n/a | n/a | n/a | n/a |
| C001-REQ-213 | TS-228 | TS-230 | TS-229 | n/a | n/a | n/a | n/a |
| C001-REQ-214 | TS-231 | TS-233 | TS-232 | n/a | n/a | n/a | n/a |
| C001-REQ-215 | TS-234 | TS-236 | TS-235 | n/a | n/a | n/a | n/a |
| C001-REQ-216 | TS-237 | n/a: without a provider C001-REQ-219 applies (TS-242) | n/a: one item or many follow the same rule | n/a: provider failures are C001-REQ-816 and C001-REQ-817 (C001-CAP-08) | n/a | n/a | n/a: model output is marked and never clears a hunk (C001-REQ-412) |
| C001-REQ-217 | TS-238 | TS-239 | TS-249 | n/a | n/a | n/a | TS-249 (model output cannot hold a hunk open and so change the open share) |
| C001-REQ-218 | TS-240 | TS-250 | TS-241 | n/a | n/a | n/a | n/a |
| C001-REQ-219 | TS-242 | TS-242 | TS-243 | n/a | n/a | n/a | n/a |
| C001-REQ-220 | TS-244 | n/a: one selection rule | TS-245 | n/a: selection offers only components of the delta | n/a | n/a | n/a |
| C001-REQ-221 | TS-246 | n/a: one listing rule | TS-247 | n/a | n/a | n/a | n/a |
| C001-REQ-222 | TS-251 | TS-253, TS-254 | TS-255 | n/a | n/a | n/a | TS-252 |
| C001-REQ-223 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-256 | TS-257 | TS-256 | n/a | n/a | n/a: the notice states only that path patterns are missing; component content is data |
| C001-REQ-224 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-258 | TS-259 | TS-258 | n/a | n/a | n/a: the manifest is parsed and never run; its hunks stay in a guarded area (C001-REQ-416) |

- **error (bare n/a):** the requirement computes or shows a result from a snapshot already taken in; it has no failure path of its own, and failures of intake belong to C001-CAP-01.
- **authorization (every bare n/a):** the review assistant is a single-user tool on the developer's machine with no roles in the first version; requests from other hosts and other web origins are refused by C001-REQ-905 to C001-REQ-907.
- **concurrency/idempotency (every bare n/a):** the architecture delta is computed once per snapshot and kept with it (C001-REQ-119); reproducible results over repeated analyses are measured by C001-NFR-015.
- **abuse (bare n/a):** the input is the code of the change itself, which the scenarios treat as untrusted content; the requirement only parses it and runs none of it.
