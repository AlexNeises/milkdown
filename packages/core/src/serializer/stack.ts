/* Copyright 2021, Milkdown by Mirone. */
import { Mark } from 'prosemirror-model';

import type { MarkdownNode } from '..';
import { AnyRecord, getStackUtil } from '../utility';
import { createElement, StackElement } from './stack-element';

type Ctx = {
    marks: Mark[];
    readonly elements: StackElement[];
};

const { size, push, open, close } = getStackUtil<MarkdownNode, StackElement, Ctx>();

const createMarkdownNode = (element: StackElement) => {
    const node: MarkdownNode = {
        ...element.props,
        type: element.type,
    };

    if (element.children) {
        node.children = element.children;
    }

    if (element.value) {
        node.value = element.value;
    }

    return node;
};

const openNode = (ctx: Ctx) => (type: string, value?: string, props?: AnyRecord) =>
    open(ctx)(createElement(type, [], value, props));

const addNode =
    (ctx: Ctx) =>
    (type: string, children?: MarkdownNode[], value?: string, props?: AnyRecord): MarkdownNode => {
        const element = createElement(type, children, value, props);
        const node: MarkdownNode = createMarkdownNode(element);

        push(ctx)(node);

        return node;
    };

const closeNode = (ctx: Ctx) => (): MarkdownNode => {
    const element = close(ctx);

    return addNode(ctx)(element.type, element.children, element.value, element.props);
};

const openMark =
    (ctx: Ctx) =>
    (mark: Mark, type: string, value?: string, props?: AnyRecord): void => {
        const isIn = mark.isInSet(ctx.marks);

        if (isIn) {
            return;
        }
        ctx.marks = mark.addToSet(ctx.marks);
        openNode(ctx)(type, value, props);
    };

const closeMark =
    (ctx: Ctx) =>
    (mark: Mark): MarkdownNode | null => {
        if (!mark.isInSet(ctx.marks)) return null;
        ctx.marks = mark.type.removeFromSet(ctx.marks);
        return closeNode(ctx)();
    };

const build = (ctx: Ctx) => () => {
    let doc: MarkdownNode | null = null;
    do {
        doc = closeNode(ctx)();
    } while (size(ctx));

    return doc;
};

export const createStack = () => {
    const ctx: Ctx = {
        marks: [],
        elements: [],
    };

    return {
        build: build(ctx),
        openMark: openMark(ctx),
        closeMark: closeMark(ctx),
        openNode: openNode(ctx),
        addNode: addNode(ctx),
        closeNode: closeNode(ctx),
    };
};

export type Stack = ReturnType<typeof createStack>;
