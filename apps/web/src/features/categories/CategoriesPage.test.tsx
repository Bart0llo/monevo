import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { categoryFixture, ok, stubApi } from '../../test/api';
import { renderApp } from '../../test/render';
import { buildTree } from './CategoriesPage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const FOOD = categoryFixture({ id: '44444444-4444-4444-8444-000000000001', name: 'Food' });
const GROCERIES = categoryFixture({
  id: '44444444-4444-4444-8444-000000000002',
  name: 'Groceries',
  parentId: FOOD.id,
  sortOrder: 1,
});
const RESTAURANTS = categoryFixture({
  id: '44444444-4444-4444-8444-000000000003',
  name: 'Restaurants',
  parentId: FOOD.id,
  sortOrder: 0,
});
const OLD_HOBBY = categoryFixture({
  id: '44444444-4444-4444-8444-000000000004',
  name: 'Old hobby',
  sortOrder: 1,
  archivedAt: '2026-11-18T10:00:00.000Z',
});
const HOBBY_GEAR = categoryFixture({
  id: '44444444-4444-4444-8444-000000000005',
  name: 'Hobby gear',
  parentId: OLD_HOBBY.id,
});
const SALARY = categoryFixture({
  id: '44444444-4444-4444-8444-000000000006',
  name: 'Salary',
  type: 'INCOME',
});
const ALL = [GROCERIES, OLD_HOBBY, SALARY, FOOD, HOBBY_GEAR, RESTAURANTS];

describe('buildTree', () => {
  it('groups subcategories under their parent, per type, in sort order', () => {
    const tree = buildTree(ALL, 'EXPENSE');
    expect(tree.map((node) => node.category.name)).toEqual(['Food', 'Old hobby']);
    expect(tree[0]?.children.map((child) => child.name)).toEqual(['Restaurants', 'Groceries']);
    expect(buildTree(ALL, 'INCOME').map((node) => node.category.name)).toEqual(['Salary']);
  });
});

describe('categories page', () => {
  it('hides archived categories, and the children of an archived parent, until asked', async () => {
    stubApi({ routes: { 'GET /categories': () => ok({ items: ALL }) } });
    const user = userEvent.setup();
    await renderApp('/categories');
    expect(await screen.findByRole('heading', { level: 1, name: 'Categories' })).toBeTruthy();
    const list = await screen.findByRole('region', { name: 'Expenses' });
    expect(within(list).getByText('Food')).toBeTruthy();
    expect(within(list).getByText('Restaurants')).toBeTruthy();
    expect(within(list).queryByText('Old hobby')).toBeNull();
    expect(within(list).queryByText('Hobby gear')).toBeNull();
    expect(within(list).queryByText('Salary')).toBeNull();

    await user.click(screen.getByRole('switch', { name: 'Show archived categories' }));
    expect(within(list).getByText('Old hobby')).toBeTruthy();
    expect(within(list).getByText('Hobby gear')).toBeTruthy();
    expect(within(list).getByText('Hidden: parent archived')).toBeTruthy();
  });

  it('names the subcategory count before deleting a parent', async () => {
    stubApi({ routes: { 'GET /categories': () => ok({ items: ALL }) } });
    const user = userEvent.setup();
    await renderApp('/categories');
    await user.click(await screen.findByRole('button', { name: 'Actions for Food' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete category?' });
    expect(within(dialog).getByText(/its 2 subcategories will be deleted/)).toBeTruthy();
  });
});
