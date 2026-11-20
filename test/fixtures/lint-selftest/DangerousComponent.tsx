// Input of test/unit/web/forbidden-html-rule.test.ts: a component the lint must refuse.
export function Dangerous(props: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: props.html }} />;
}
