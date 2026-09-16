// --- Lazy LaTeX Parser Engine ---
// A small, dependency-free tokenizer + recursive-descent parser for the
// subset of LaTeX this tool cares about: math environments, display/inline
// math, groups, and commands. It replaces a chain of flat regexes with a
// real tree, which is what lets escapes (\%, \$, \{, \}) and arbitrary
// nesting (matrices inside align, \text{} labels with nested braces,
// math tucked inside non-math environments) get handled correctly instead
// of by pattern-matching coincidence.

const MATH_ENVIRONMENTS = new Set([
    'align', 'align*', 'equation', 'equation*',
    'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix', 'matrix'
]);

// Commands whose following {group}s are real arguments rather than
// unrelated text that happens to follow them. Only text/mathrm/operatorname
// need this for correctness (their argument is a label, not a variable) --
// the rest are here so the tree models real LaTeX macro structure.
const COMMAND_ARITY = {
    frac: 2, dfrac: 2, tfrac: 2, binom: 2, dbinom: 2,
    sqrt: 1, hat: 1, bar: 1, vec: 1, dot: 1, ddot: 1, tilde: 1,
    overline: 1, underline: 1, widehat: 1, widetilde: 1,
    text: 1, mathrm: 1, mathbf: 1, mathit: 1, mathcal: 1, mathbb: 1,
    operatorname: 1, boldsymbol: 1
};

// Visual-only boilerplate commands: dropped entirely during serialization.
const BOILERPLATE_COMMANDS = new Set(['left', 'right', 'quad', 'qquad', ',', ';', '!']);

// Label/prose wrappers: their argument is text, not math, so it's excluded
// when scanning for variables (but kept intact in the full equation output).
const TEXT_LIKE_COMMANDS = new Set(['text', 'mathrm', 'operatorname']);

const GREEK_LETTERS = /^(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)$/;
const VAR_TOKEN_REGEX = /(\\[a-zA-Z]+(?:_\{[^\s}]+\}|_[a-zA-Z0-9])?|[a-zA-Z](?:_\{[^\s}]+\}|_[a-zA-Z0-9])?)/g;

// --- Tokenizer ---
// Comments (unescaped %) are dropped here, at the character level, so an
// escaped \% never gets mistaken for one -- the backslash+char pair is
// always consumed together as a single command token below, before the
// bare '%'/'$'/'{'/'}'/'&' branches ever see that character again.
function tokenize(input) {
    const tokens = [];
    const n = input.length;
    let i = 0;

    while (i < n) {
        const ch = input[i];

        if (ch === '\\') {
            const rest = input.slice(i + 1);
            const nameMatch = /^[a-zA-Z]+/.exec(rest);
            if (nameMatch) {
                tokens.push({ type: 'command', name: nameMatch[0] });
                i += 1 + nameMatch[0].length;
            } else if (input[i + 1] === '[') {
                tokens.push({ type: 'display-open' });
                i += 2;
            } else if (input[i + 1] === ']') {
                tokens.push({ type: 'display-close' });
                i += 2;
            } else {
                // Single-symbol command, e.g. \% \$ \{ \} \& \_ \, \; \! \\
                tokens.push({ type: 'command', name: input[i + 1] || '' });
                i += 2;
            }
            continue;
        }

        if (ch === '%') {
            let j = i + 1;
            while (j < n && input[j] !== '\n') j++;
            i = j;
            continue;
        }

        if (ch === '{') { tokens.push({ type: 'group-open' }); i++; continue; }
        if (ch === '}') { tokens.push({ type: 'group-close' }); i++; continue; }

        if (ch === '$') {
            if (input[i + 1] === '$') { tokens.push({ type: 'display-dollar' }); i += 2; }
            else { tokens.push({ type: 'inline-dollar' }); i += 1; }
            continue;
        }

        if (ch === '&') { tokens.push({ type: 'text', value: ' ' }); i++; continue; }

        let j = i;
        while (j < n && !'\\%{}$&'.includes(input[j])) j++;
        tokens.push({ type: 'text', value: input.slice(i, j) });
        i = j;
    }

    return tokens;
}

function tryConsumeEnd(tokens, pos, envName) {
    if (!(tokens[pos] && tokens[pos].type === 'command' && tokens[pos].name === 'end')) return -1;
    let p = pos + 1;
    if (!(tokens[p] && tokens[p].type === 'group-open')) return -1;
    p++;
    let name = '';
    while (tokens[p] && tokens[p].type === 'text') { name += tokens[p].value; p++; }
    if (!(tokens[p] && tokens[p].type === 'group-close')) return -1;
    p++;
    return name.trim() === envName ? p : -1;
}

// --- Parser ---
// Malformed input (unbalanced braces/environments) never throws -- it just
// degrades to treating unmatched openers as running to end-of-input, since
// this tool operates on arbitrary user-pasted snippets, not full documents.
export function parse(input) {
    const tokens = tokenize(input);
    let pos = 0;

    function parseGroupName() {
        if (!(tokens[pos] && tokens[pos].type === 'group-open')) return '';
        pos++;
        let name = '';
        while (tokens[pos] && tokens[pos].type === 'text') { name += tokens[pos].value; pos++; }
        if (tokens[pos] && tokens[pos].type === 'group-close') pos++;
        return name.trim();
    }

    function parseNodes(isTerminator) {
        const nodes = [];
        while (pos < tokens.length) {
            if (isTerminator && isTerminator()) break;
            const tok = tokens[pos];

            if (tok.type === 'text') { nodes.push({ type: 'text', value: tok.value }); pos++; continue; }

            if (tok.type === 'group-close' || tok.type === 'display-close') {
                pos++; // stray closer with no opener in this scope
                continue;
            }

            if (tok.type === 'group-open') {
                pos++;
                const children = parseNodes(() => tokens[pos] && tokens[pos].type === 'group-close');
                if (tokens[pos] && tokens[pos].type === 'group-close') pos++;
                nodes.push({ type: 'group', children });
                continue;
            }

            if (tok.type === 'inline-dollar') {
                pos++;
                const children = parseNodes(() => tokens[pos] && tokens[pos].type === 'inline-dollar');
                if (tokens[pos] && tokens[pos].type === 'inline-dollar') pos++;
                nodes.push({ type: 'math-inline', children });
                continue;
            }

            if (tok.type === 'display-dollar') {
                pos++;
                const children = parseNodes(() => tokens[pos] && tokens[pos].type === 'display-dollar');
                if (tokens[pos] && tokens[pos].type === 'display-dollar') pos++;
                nodes.push({ type: 'math-display', children });
                continue;
            }

            if (tok.type === 'display-open') {
                pos++;
                const children = parseNodes(() => tokens[pos] && tokens[pos].type === 'display-close');
                if (tokens[pos] && tokens[pos].type === 'display-close') pos++;
                nodes.push({ type: 'math-display', children });
                continue;
            }

            // tok.type === 'command'
            pos++;
            if (tok.name === 'begin') {
                const envName = parseGroupName();
                const children = parseNodes(() => tryConsumeEnd(tokens, pos, envName) !== -1);
                const endPos = tryConsumeEnd(tokens, pos, envName);
                if (endPos !== -1) pos = endPos;
                nodes.push({ type: 'environment', name: envName, math: MATH_ENVIRONMENTS.has(envName), children });
                continue;
            }

            const arity = COMMAND_ARITY[tok.name] || 0;
            const args = [];
            for (let a = 0; a < arity; a++) {
                if (!(tokens[pos] && tokens[pos].type === 'group-open')) break;
                pos++;
                const argChildren = parseNodes(() => tokens[pos] && tokens[pos].type === 'group-close');
                if (tokens[pos] && tokens[pos].type === 'group-close') pos++;
                args.push({ type: 'group', children: argChildren });
            }
            nodes.push({ type: 'command', name: tok.name, args });
        }
        return nodes;
    }

    return parseNodes(null);
}

// --- Region extraction ---
// Walks the tree pulling out math environments/display/inline math as
// "regions" in document order, and returns the same tree with those
// regions excised (what's left is the surrounding prose). Recurses into
// non-math containers (groups, unlisted environments, command args) so
// math tucked inside e.g. \begin{itemize} or a stray {group} is still found.
export function extractRegions(nodes) {
    const regions = [];
    const remaining = [];

    for (const node of nodes) {
        if (node.type === 'environment' && node.math) {
            regions.push(node);
            continue;
        }
        if (node.type === 'math-display' || node.type === 'math-inline') {
            regions.push(node);
            continue;
        }
        if (node.type === 'environment') {
            const inner = extractRegions(node.children);
            regions.push(...inner.regions);
            remaining.push({ ...node, children: inner.remaining });
            continue;
        }
        if (node.type === 'group') {
            const inner = extractRegions(node.children);
            regions.push(...inner.regions);
            remaining.push({ ...node, children: inner.remaining });
            continue;
        }
        if (node.type === 'command' && node.args.length) {
            const newArgs = node.args.map(arg => {
                const inner = extractRegions(arg.children);
                regions.push(...inner.regions);
                return { ...arg, children: inner.remaining };
            });
            remaining.push({ ...node, args: newArgs });
            continue;
        }
        remaining.push(node);
    }

    return { regions, remaining };
}

// --- Serialization ---
// Reconstructs source text from a node list. In `skipTextLikeArgs` mode,
// \text{}/\mathrm{}/\operatorname{} are omitted entirely -- used only when
// scanning for variables, so a label like \text{foo} can't contribute
// "f" and "o" to the registry. Environment/math wrappers never re-emit
// their \begin{}/\end{}/$/\[\] delimiters -- only their inner content.
export function serialize(nodes, { skipTextLikeArgs = false } = {}) {
    let out = '';
    for (const node of nodes) {
        switch (node.type) {
            case 'text':
                out += node.value;
                break;
            case 'group':
                out += '{' + serialize(node.children, { skipTextLikeArgs }) + '}';
                break;
            case 'environment':
            case 'math-inline':
            case 'math-display':
                out += serialize(node.children, { skipTextLikeArgs });
                break;
            case 'command':
                if (BOILERPLATE_COMMANDS.has(node.name)) break;
                if (skipTextLikeArgs && TEXT_LIKE_COMMANDS.has(node.name)) break;
                out += '\\' + node.name;
                for (const arg of node.args) {
                    out += '{' + serialize(arg.children, { skipTextLikeArgs }) + '}';
                }
                break;
            default:
                break;
        }
    }
    return out;
}

// --- Variable extraction ---
// Bare letters and named Greek-letter commands count as variables;
// every other backslash command (\times, \hat, \leq, ...) is formatting/
// operator syntax, not a variable, so it's excluded.
export function extractVariables(regionNode) {
    const scanText = serialize(regionNode.children, { skipTextLikeArgs: true });
    const variables = new Set();
    let vMatch;
    VAR_TOKEN_REGEX.lastIndex = 0;
    while ((vMatch = VAR_TOKEN_REGEX.exec(scanText)) !== null) {
        const token = vMatch[1];
        if (token.startsWith('\\')) {
            const baseName = token.match(/^\\([a-zA-Z]+)/)[1];
            if (GREEK_LETTERS.test(baseName)) variables.add(token);
        } else {
            variables.add(token);
        }
    }
    return variables;
}

export function regionLabel(node) {
    if (node.type === 'environment') return node.name;
    return node.type === 'math-display' ? 'display' : 'inline';
}
