# Spike C001-T-020 (spike-grade, never shipped): minimal Python mutation engine with the operators
# of C001-ADR-007 §3. C001-T-063 replaces it.
#
# Mutation sites are enumerated over the module's syntax tree in `ast.walk` order (deterministic for
# a given source), every site of the module numbered; `list` keeps the sites on the requested
# lines. A mutant is applied at import time in the mutation copy only: a process started with
# SDDR_MUTANT=<repository path>::<site number> gets a meta-path finder (installed by the hook,
# sitecustomize.py) that compiles that one module from its mutated tree without writing bytecode,
# so parallel workers share the copy.
#
# Usage:
#   python sddr_mutate.py list <plan.json> <out.json>   plan: {"root": ..., "files": {path: [lines]}}
#   python sddr_mutate.py selftest
import ast
import importlib.abc
import importlib.machinery
import json
import os
import sys

_ARITH = {
    ast.Add: ast.Sub,
    ast.Sub: ast.Add,
    ast.Mult: ast.Div,
    ast.Div: ast.Mult,
    ast.FloorDiv: ast.Div,
    ast.Mod: ast.Mult,
}
_CMP = {
    ast.Lt: ast.LtE,
    ast.LtE: ast.Lt,
    ast.Gt: ast.GtE,
    ast.GtE: ast.Gt,
    ast.Eq: ast.NotEq,
    ast.NotEq: ast.Eq,
    ast.Is: ast.IsNot,
    ast.IsNot: ast.Is,
    ast.In: ast.NotIn,
    ast.NotIn: ast.In,
}
_SYM = {
    ast.Add: "+",
    ast.Sub: "-",
    ast.Mult: "*",
    ast.Div: "/",
    ast.FloorDiv: "//",
    ast.Mod: "%",
    ast.Lt: "<",
    ast.LtE: "<=",
    ast.Gt: ">",
    ast.GtE: ">=",
    ast.Eq: "==",
    ast.NotEq: "!=",
    ast.Is: "is",
    ast.IsNot: "is not",
    ast.In: "in",
    ast.NotIn: "not in",
    ast.And: "and",
    ast.Or: "or",
}


def _parents(tree):
    parents = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[child] = node
    return parents


def _replace(parents, node, new):
    """Replaces `node` by `new` in its parent (a field or an item of a list field)."""
    parent = parents[node]
    for field, value in ast.iter_fields(parent):
        if value is node:
            setattr(parent, field, new)
            return
        if isinstance(value, list):
            for i, item in enumerate(value):
                if item is node:
                    value[i] = new
                    return
    raise ValueError("node not found in its parent")


def _is_docstring(node, parents):
    parent = parents.get(node)
    if not isinstance(parent, ast.Expr):
        return False
    owner = parents.get(parent)
    body = getattr(owner, "body", None)
    return isinstance(body, list) and body and body[0] is parent


def _sites_of(node, parents):
    """(line, description, apply(node, parents)) for each mutation of `node`."""
    out = []
    line = getattr(node, "lineno", None)
    if isinstance(node, (ast.BinOp, ast.AugAssign)) and type(node.op) in _ARITH:
        new = _ARITH[type(node.op)]
        desc = f"{_SYM[type(node.op)]} -> {_SYM[new]}"
        if isinstance(node, ast.AugAssign):
            desc = f"{_SYM[type(node.op)]}= -> {_SYM[new]}="
        out.append((line, desc, lambda n, p, new=new: setattr(n, "op", new())))
    elif isinstance(node, ast.Compare):
        for i, op in enumerate(node.ops):
            if type(op) in _CMP:
                new = _CMP[type(op)]

                def apply(n, p, i=i, new=new):
                    n.ops[i] = new()

                out.append((line, f"{_SYM[type(op)]} -> {_SYM[new]}", apply))
    elif isinstance(node, ast.BoolOp):
        new = ast.Or if isinstance(node.op, ast.And) else ast.And
        out.append(
            (
                line,
                f"{_SYM[type(node.op)]} -> {_SYM[new]}",
                lambda n, p, new=new: setattr(n, "op", new()),
            )
        )
    elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        out.append((line, "not x -> x", lambda n, p: _replace(p, n, n.operand)))
    elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        out.append((line, "-x -> x", lambda n, p: _replace(p, n, n.operand)))
    elif isinstance(node, ast.Constant) and not isinstance(
        parents.get(node), ast.JoinedStr
    ):
        v = node.value
        if v is True or v is False:
            out.append(
                (line, f"{v} -> {not v}", lambda n, p: setattr(n, "value", not n.value))
            )
        elif isinstance(v, int):
            new = 1 if v == 0 else 0 if v == 1 else v + 1
            out.append(
                (line, f"{v} -> {new}", lambda n, p, new=new: setattr(n, "value", new))
            )
        elif isinstance(v, str) and v and not _is_docstring(node, parents):
            out.append((line, 'string -> ""', lambda n, p: setattr(n, "value", "")))
    elif isinstance(node, ast.Return) and node.value is not None:
        if not (isinstance(node.value, ast.Constant) and node.value.value is None):
            out.append(
                (
                    line,
                    "return x -> return None",
                    lambda n, p: setattr(n, "value", ast.Constant(None)),
                )
            )
    elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
        out.append(
            (line, "call statement -> pass", lambda n, p: _replace(p, n, ast.Pass()))
        )
    if isinstance(node, (ast.If, ast.While, ast.IfExp)):
        out.append(
            (
                line,
                "condition -> not condition",
                lambda n, p: setattr(n, "test", ast.UnaryOp(ast.Not(), n.test)),
            )
        )
    return out


def sites(tree):
    """Every mutation site of the module, numbered in ast.walk order."""
    parents = _parents(tree)
    out = []
    for node in ast.walk(tree):
        for line, desc, apply in _sites_of(node, parents):
            out.append((node, line, desc, apply, parents))
    return out


def enumerate_mutants(source, lines):
    tree = ast.parse(source)
    wanted = set(lines)
    return [
        {"id": k, "line": line, "desc": desc}
        for k, (_node, line, desc, _apply, _p) in enumerate(sites(tree))
        if line in wanted
    ]


def mutated_tree(source, k, filename="<mutant>"):
    tree = ast.parse(source, filename)
    all_sites = sites(tree)
    node, _line, _desc, apply, parents = all_sites[k]
    apply(node, parents)
    return ast.fix_missing_locations(tree)


class _MutantLoader(importlib.machinery.SourceFileLoader):
    def __init__(self, fullname, path, k):
        super().__init__(fullname, path)
        self._k = k

    def get_code(self, fullname):
        with open(self.path, "rb") as f:
            source = f.read()
        tree = mutated_tree(source, self._k, self.path)
        return compile(tree, self.path, "exec", dont_inherit=True)


class _MutantFinder(importlib.abc.MetaPathFinder):
    def __init__(self, target, k):
        self._target = os.path.normcase(os.path.abspath(target))
        self._k = k

    def find_spec(self, fullname, path=None, target=None):
        spec = importlib.machinery.PathFinder.find_spec(fullname, path)
        if spec is None or not spec.origin:
            return None
        if os.path.normcase(os.path.abspath(spec.origin)) != self._target:
            return None
        spec.loader = _MutantLoader(fullname, spec.origin, self._k)
        return spec


def install(config, mutant):
    """Called by the hook for SDDR_MUTANT=<path>::<k>, relative to the current workspace root."""
    rel, _, k = mutant.rpartition("::")
    root = config.get("workspaceRoot") or os.getcwd()
    sys.dont_write_bytecode = True
    sys.meta_path.insert(0, _MutantFinder(os.path.join(root, *rel.split("/")), int(k)))


def _cli_list(plan_path, out_path):
    with open(plan_path, encoding="utf-8") as f:
        plan = json.load(f)
    out = {}
    for rel, lines in plan["files"].items():
        with open(os.path.join(plan["root"], *rel.split("/")), "rb") as f:
            source = f.read()
        try:
            out[rel] = enumerate_mutants(source, lines)
        except SyntaxError as e:
            out[rel] = {"error": str(e)}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f)


def _selftest():
    src = (
        "def f(a, b):\n"
        "    if a < b and not a:\n"
        "        return a + b * 2\n"
        "    x = -a\n"
        "    x += 1\n"
        "    print('hi')\n"
        "    return x in [0] or a is None\n"
    )
    found = {m["desc"] for m in enumerate_mutants(src, range(1, 8))}
    expected = {
        "< -> <=",
        "and -> or",
        "not x -> x",
        "condition -> not condition",
        "+ -> -",
        "* -> /",
        "2 -> 3",
        "-x -> x",
        "+= -> -=",
        "1 -> 0",
        "call statement -> pass",
        'string -> ""',
        "in -> not in",
        "is -> is not",
        "or -> and",
        "return x -> return None",
    }
    missing = expected - found
    assert not missing, f"missing operators: {sorted(missing)}"
    src2 = "def g(a, b):\n    return a + b\n"
    ns = {}
    k = next(m["id"] for m in enumerate_mutants(src2, [2]) if m["desc"] == "+ -> -")
    exec(compile(mutated_tree(src2, k), "<t>", "exec"), ns)
    assert ns["g"](3, 5) == -2, "mutant + -> - not applied"
    ns = {}
    k = next(
        m["id"]
        for m in enumerate_mutants(src2, [2])
        if m["desc"] == "return x -> return None"
    )
    exec(compile(mutated_tree(src2, k), "<t>", "exec"), ns)
    assert ns["g"](3, 5) is None, "mutant return -> return None not applied"
    print(json.dumps({"ok": True, "operators": sorted(found)}))


if __name__ == "__main__":
    if sys.argv[1:2] == ["list"]:
        _cli_list(sys.argv[2], sys.argv[3])
    elif sys.argv[1:2] == ["selftest"]:
        _selftest()
    else:
        print(
            __doc__ or "usage: sddr_mutate.py list <plan.json> <out.json> | selftest",
            file=sys.stderr,
        )
        sys.exit(2)
