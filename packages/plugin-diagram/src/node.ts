/* Copyright 2021, Milkdown by Mirone. */
import { css } from '@emotion/css';
import { createNode } from '@milkdown/utils';
import mermaid from 'mermaid';
import { customAlphabet } from 'nanoid';
import { textblockTypeInputRule } from 'prosemirror-inputrules';
import { Node } from 'prosemirror-model';

const nanoid = customAlphabet('abcedfghicklmn', 10);

function componentToHex(c: number) {
    const hex = c.toString(16);
    return hex.length == 1 ? '0' + hex : hex;
}

function rgbToHex(r: number, g: number, b: number) {
    return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function tryRgbToHex(maybeRgb: string) {
    if (!maybeRgb) return '';

    const result = maybeRgb.split(',').map((x) => Number(x.trim()));

    if (result.length < 3) {
        return maybeRgb;
    }

    const valid = result.every((x) => {
        return x >= 0 && x <= 256;
    });

    if (!valid) {
        return maybeRgb;
    }

    return rgbToHex(...(result as [number, number, number]));
}

const inputRegex = /^```mermaid$/;

export const diagramNode = createNode((options, utils) => {
    const codeStyle = utils.getStyle(
        ({ palette, size, font }) => css`
            color: ${palette('neutral', 0.87)};
            background-color: ${palette('background')};
            border-radius: ${size.radius};
            padding: 1rem 2rem;
            font-size: 0.875rem;
            font-family: ${font.code};
            overflow: hidden;
        `,
    );
    const hideCodeStyle = css`
        display: none;
    `;
    const previewPanelStyle = utils.getStyle(
        () => css`
            display: flex;
            justify-content: center;
            padding: 1rem 0;
        `,
    );
    const mermaidVariables = () => {
        const styleRoot = getComputedStyle(document.documentElement);
        const getColor = (v: string) => tryRgbToHex(styleRoot.getPropertyValue('--' + v));
        const primary = getColor('primary');
        const secondary = getColor('secondary');
        const solid = getColor('solid');
        const neutral = getColor('neutral');
        const background = getColor('background');
        const style = {
            background,
            primaryColor: secondary,
            secondaryColor: primary,
            primaryTextColor: neutral,
            noteBkgColor: background,
            noteTextColor: solid,
        };
        return Object.entries(style)
            .filter(([_, value]) => value.length > 0)
            .map(([key, value]) => `'${key}':'${value}'`)
            .join(', ');
    };
    const header = `%%{init: {'theme': 'base', 'themeVariables': { ${mermaidVariables()} }}}%%\n`;

    const id = 'diagram';
    mermaid.startOnLoad = false;
    mermaid.initialize({ startOnLoad: false });

    return {
        id,
        schema: {
            content: 'text*',
            group: 'block',
            marks: '',
            defining: true,
            code: true,
            attrs: {
                value: {
                    default: '',
                },
                identity: {
                    default: '',
                },
                editing: {
                    default: false,
                },
            },
            parseDOM: [
                {
                    tag: 'div[data-type="diagram"]',
                    preserveWhitespace: 'full',
                    getAttrs: (dom) => {
                        if (!(dom instanceof HTMLElement)) {
                            throw new Error();
                        }
                        return {
                            value: dom.innerHTML,
                            id: dom.id,
                        };
                    },
                },
            ],
            toDOM: (node) => {
                const id = node.attrs.identity || nanoid();
                return [
                    'div',
                    {
                        id: node.attrs.identity || nanoid(),
                        class: utils.getClassName(node.attrs, 'mermaid'),
                        'data-type': id,
                        'data-value': node.attrs.value,
                        'data-editing': node.attrs.editing.toString(),
                    },
                    0,
                ];
            },
        },
        parser: {
            match: ({ type }) => type === id,
            runner: (state, node, type) => {
                const value = node.value as string;
                state.openNode(type, { value });
                state.addText(value);
                state.closeNode();
            },
        },
        serializer: {
            match: (node) => node.type.name === id,
            runner: (state, node) => {
                state.addNode('code', undefined, node.content.firstChild?.text || '', { lang: 'mermaid' });
            },
        },
        view: (editor, nodeType, node, view, getPos, decorations) => {
            const currentId = node.attrs.identity || nanoid();
            let currentNode = node;
            if (options?.view) {
                return options.view(editor, nodeType, node, view, getPos, decorations);
            }
            const dom = document.createElement('div');
            dom.classList.add('mermaid', 'diagram');
            const code = document.createElement('div');
            code.dataset.type = id;
            code.dataset.value = node.attrs.value;
            if (codeStyle) {
                code.classList.add(codeStyle);
            }

            const rendered = document.createElement('div');
            rendered.id = currentId;
            if (previewPanelStyle) {
                rendered.classList.add(previewPanelStyle);
            }

            dom.append(code);

            dom.dataset.editing = node.attrs.editing.toString();
            const updateEditing = (node: Node) => {
                if (!node.attrs.editing) {
                    code.classList.add(hideCodeStyle);
                    return;
                }

                code.classList.remove(hideCodeStyle);
            };

            const render = (node: Node) => {
                const code = header + node.attrs.value;
                try {
                    const svg = mermaid.render(currentId, code);
                    rendered.innerHTML = svg;
                } catch {
                    const error = document.getElementById('d' + currentId);
                    if (error) {
                        error.remove();
                    }
                    if (!node.attrs.value) {
                        rendered.innerHTML = 'Empty';
                    } else {
                        rendered.innerHTML = 'Syntax Error';
                    }
                } finally {
                    dom.appendChild(rendered);
                }
            };

            updateEditing(node);
            render(node);

            dom.addEventListener('mousedown', (e) => {
                if (currentNode.attrs.editing) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                const { tr } = view.state;
                const _tr = tr.setNodeMarkup(getPos(), nodeType, {
                    ...currentNode.attrs,
                    editing: true,
                });
                view.dispatch(_tr);
            });
            view.dom.addEventListener('mousedown', (e) => {
                if (!currentNode.attrs.editing) {
                    return;
                }
                const el = e.target;
                if (el === code || el === rendered) {
                    return;
                }
                const { tr } = view.state;
                const _tr = tr.setNodeMarkup(getPos(), nodeType, {
                    ...currentNode.attrs,
                    editing: false,
                });
                view.dispatch(_tr);
            });

            return {
                dom,
                contentDOM: code,
                update: (updatedNode) => {
                    if (updatedNode.type.name !== id) return false;
                    currentNode = updatedNode;

                    updateEditing(updatedNode);

                    const newVal = updatedNode.content.firstChild?.text || '';

                    code.dataset.value = newVal;
                    dom.dataset.editing = updatedNode.attrs.editing.toString();
                    updatedNode.attrs.value = newVal;

                    render(updatedNode);

                    return true;
                },
                selectNode() {
                    if (!view.editable) return;
                },
                deselectNode() {
                    code.classList.add(hideCodeStyle);
                    const { tr } = view.state;
                    const _tr = tr.setNodeMarkup(getPos(), nodeType, {
                        ...node.attrs,
                        editing: false,
                    });
                    view.dispatch(_tr);
                },
                destroy() {
                    rendered.remove();
                    code.remove();
                    dom.remove();
                },
            };
        },
        inputRules: (nodeType) => [
            textblockTypeInputRule(inputRegex, nodeType, () => ({ id: nanoid(), editing: true })),
        ],
    };
});
