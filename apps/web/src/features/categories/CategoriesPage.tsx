import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_TYPES, type Category, type CategoryType, type IconKey } from '@monevo/contracts';
import { ColorPicker, EntityIcon, IconPicker } from '../../components/EntityIcon';
import { PageHeader } from '../../components/PageHeader';
import { StatePanel } from '../../components/StatePanel';
import { useErrorMessage } from '../../data/errors';
import { useCategories, useCategoryMutations } from '../../data/reference';

// Categories (features.md#categories): income and expense trees, two levels. An archived parent
// hides its subcategories, which keep their own archived state.

interface Node {
  readonly category: Category;
  readonly children: readonly Category[];
}

function bySortOrder(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

/** Top-level categories of `type` with their subcategories, in display order. */
export function buildTree(categories: readonly Category[], type: CategoryType): Node[] {
  const ofType = categories.filter((category) => category.type === type);
  return ofType
    .filter((category) => category.parentId === null)
    .sort(bySortOrder)
    .map((category) => ({
      category,
      children: ofType.filter((child) => child.parentId === category.id).sort(bySortOrder),
    }));
}

type Editing =
  | { mode: 'create'; type: CategoryType; parent: Category | null }
  | { mode: 'edit'; category: Category; hasChildren: boolean };

export function CategoriesPage() {
  const { t } = useTranslation();
  const categories = useCategories();
  const errorMessage = useErrorMessage();
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Node | null>(null);

  const tree = buildTree(categories.data ?? [], type);
  const visible = showArchived ? tree : tree.filter((node) => node.category.archivedAt === null);

  return (
    <>
      <PageHeader title={t('categories.title')} description={t('categories.description')} />
      <Group mb="lg" justify="space-between">
        <SegmentedControl
          aria-label={t('categories.typeLabel')}
          value={type}
          onChange={(value) => setType(value as CategoryType)}
          data={CATEGORY_TYPES.map((value) => ({
            value,
            label: t(`categories.types.${value}`),
          }))}
        />
        <Group gap="md">
          <Switch
            label={t('categories.showArchived')}
            checked={showArchived}
            onChange={(event) => setShowArchived(event.currentTarget.checked)}
          />
          <Button
            leftSection={<IconPlus size={16} aria-hidden="true" />}
            onClick={() => setEditing({ mode: 'create', type, parent: null })}
          >
            {t('categories.create')}
          </Button>
        </Group>
      </Group>
      {categories.isPending ? (
        <Center py="xl">
          <Loader size="sm" aria-label={t('auth.loading')} />
        </Center>
      ) : categories.isError ? (
        <Alert color="red" variant="light" role="alert">
          {errorMessage(categories.error)}
        </Alert>
      ) : visible.length === 0 ? (
        <StatePanel>
          <Text>{t(`categories.empty.${type}`)}</Text>
        </StatePanel>
      ) : (
        <section className="mv-section" aria-label={t(`categories.types.${type}`)}>
          <ul className="mv-list">
            {visible.map((node, index) => (
              <CategoryBranch
                key={node.category.id}
                node={node}
                siblings={tree.map((item) => item.category)}
                first={index === 0}
                last={index === visible.length - 1}
                showArchived={showArchived}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        </section>
      )}
      {editing ? (
        <CategoryFormModal
          editing={editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <DeleteCategoryModal node={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function CategoryBranch({
  node,
  siblings,
  first,
  last,
  showArchived,
  onEdit,
  onDelete,
}: {
  readonly node: Node;
  readonly siblings: readonly Category[];
  readonly first: boolean;
  readonly last: boolean;
  readonly showArchived: boolean;
  readonly onEdit: (editing: Editing) => void;
  readonly onDelete: (node: Node) => void;
}) {
  const { category, children } = node;
  const shownChildren = showArchived
    ? children
    : children.filter((child) => child.archivedAt === null);
  return (
    <li className="mv-list-item mv-category-branch">
      <CategoryRow
        category={category}
        childCount={children.length}
        siblings={siblings}
        first={first}
        last={last}
        parentArchived={false}
        onEdit={onEdit}
        onDelete={() => onDelete(node)}
      />
      {shownChildren.length > 0 ? (
        <ul className="mv-list mv-category-children">
          {shownChildren.map((child, index) => (
            <li key={child.id} className="mv-list-item">
              <CategoryRow
                category={child}
                childCount={0}
                siblings={children}
                first={index === 0}
                last={index === shownChildren.length - 1}
                parentArchived={category.archivedAt !== null}
                onEdit={onEdit}
                onDelete={() => onDelete({ category: child, children: [] })}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CategoryRow({
  category,
  childCount,
  siblings,
  first,
  last,
  parentArchived,
  onEdit,
  onDelete,
}: {
  readonly category: Category;
  readonly childCount: number;
  readonly siblings: readonly Category[];
  readonly first: boolean;
  readonly last: boolean;
  readonly parentArchived: boolean;
  readonly onEdit: (editing: Editing) => void;
  readonly onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { archive, reorder } = useCategoryMutations();
  const errorMessage = useErrorMessage();
  const archived = category.archivedAt !== null;
  const topLevel = category.parentId === null;
  const notifyError = (error: unknown) =>
    notifications.show({ message: errorMessage(error), color: 'red' });

  const move = (offset: -1 | 1) => {
    const ids = siblings.map((sibling) => sibling.id);
    const from = ids.indexOf(category.id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to] ?? '', ids[from] ?? ''];
    reorder.mutate(ids, { onError: notifyError });
  };

  return (
    <Group justify="space-between" wrap="nowrap" w="100%">
      <Group gap="sm" wrap="nowrap">
        <EntityIcon icon={category.icon} color={category.color} size={topLevel ? 'md' : 'sm'} />
        <Stack gap={0}>
          <Text fw={topLevel ? 600 : 400}>{category.name}</Text>
          <Group gap={6}>
            {archived ? (
              <Badge variant="light" color="gray" size="sm">
                {t('categories.archivedBadge')}
              </Badge>
            ) : null}
            {parentArchived && !archived ? (
              <Badge variant="light" color="gray" size="sm">
                {t('categories.hiddenByParent')}
              </Badge>
            ) : null}
          </Group>
        </Stack>
      </Group>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            aria-label={t('categories.actionsFor', { name: category.name })}
          >
            <IconDots size={18} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => onEdit({ mode: 'edit', category, hasChildren: childCount > 0 })}
          >
            {t('actions.edit')}
          </Menu.Item>
          {topLevel && !archived ? (
            <Menu.Item
              onClick={() => onEdit({ mode: 'create', type: category.type, parent: category })}
            >
              {t('categories.addSubcategory')}
            </Menu.Item>
          ) : null}
          <Menu.Item disabled={first} onClick={() => move(-1)}>
            {t('categories.moveUp')}
          </Menu.Item>
          <Menu.Item disabled={last} onClick={() => move(1)}>
            {t('categories.moveDown')}
          </Menu.Item>
          <Menu.Item
            onClick={() =>
              archive.mutate(
                { category, archived: !archived },
                {
                  onSuccess: () =>
                    notifications.show({
                      message: t(archived ? 'categories.restored' : 'categories.archived'),
                      color: 'teal',
                    }),
                  onError: notifyError,
                },
              )
            }
          >
            {t(archived ? 'actions.restore' : 'actions.archive')}
          </Menu.Item>
          <Menu.Item color="red" onClick={onDelete}>
            {t('actions.delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

interface CategoryValues {
  name: string;
  type: CategoryType;
  parentId: string;
  icon: IconKey;
  color: string;
}

const NO_PARENT = '';

function CategoryFormModal({
  editing,
  categories,
  onClose,
}: {
  readonly editing: Editing;
  readonly categories: readonly Category[];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const { create, update } = useCategoryMutations();
  const mutation = editing.mode === 'edit' ? update : create;
  const errorMessage = useErrorMessage();
  const current = editing.mode === 'edit' ? editing.category : null;
  const form = useForm<CategoryValues>({
    initialValues: current
      ? {
          name: current.name,
          type: current.type,
          parentId: current.parentId ?? NO_PARENT,
          icon: current.icon as IconKey,
          color: current.color,
        }
      : {
          name: '',
          type: editing.mode === 'create' ? editing.type : 'EXPENSE',
          parentId: editing.mode === 'create' ? (editing.parent?.id ?? NO_PARENT) : NO_PARENT,
          icon:
            editing.mode === 'create' && editing.parent ? (editing.parent.icon as IconKey) : 'tag',
          color: editing.mode === 'create' && editing.parent ? editing.parent.color : 'blue',
        },
    validate: {
      name: (value) =>
        value.trim().length === 0
          ? t('validation.required')
          : value.trim().length > 100
            ? t('validation.tooLong', { max: 100 })
            : null,
    },
  });
  const hasChildren = editing.mode === 'edit' && editing.hasChildren;
  // Possible parents: non-archived top-level categories of the same type (never itself). The
  // current parent stays selectable even when archived.
  const parents = categories
    .filter(
      (category) =>
        category.parentId === null &&
        category.type === form.values.type &&
        category.id !== current?.id &&
        (category.archivedAt === null || category.id === current?.parentId),
    )
    .sort(bySortOrder);
  const typeLocked = hasChildren || form.values.parentId !== NO_PARENT;

  const submit = form.onSubmit((values) => {
    const options = {
      onSuccess: () => {
        notifications.show({
          message: t(current ? 'categories.saved' : 'categories.created'),
          color: 'teal',
        });
        onClose();
      },
    };
    const parentId = values.parentId === NO_PARENT ? null : values.parentId;
    if (current) {
      update.mutate(
        {
          category: current,
          changes: {
            name: values.name.trim(),
            icon: values.icon,
            color: values.color,
            ...(values.type === current.type ? {} : { type: values.type }),
            ...(parentId === current.parentId ? {} : { parentId }),
          },
        },
        options,
      );
    } else {
      create.mutate(
        {
          name: values.name.trim(),
          type: values.type,
          icon: values.icon,
          color: values.color,
          ...(parentId === null ? {} : { parentId }),
        },
        options,
      );
    }
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={t(current ? 'categories.editTitle' : 'categories.createTitle')}
      size="lg"
      centered
    >
      <form onSubmit={submit} noValidate className="mv-form">
        <TextInput
          label={t('categories.fields.name')}
          maxLength={100}
          data-autofocus
          {...form.getInputProps('name')}
        />
        <Select
          label={t('categories.fields.type')}
          data={CATEGORY_TYPES.map((value) => ({
            value,
            label: t(`categories.types.${value}`),
          }))}
          allowDeselect={false}
          disabled={typeLocked}
          description={typeLocked ? t('categories.fields.typeLocked') : undefined}
          {...form.getInputProps('type')}
        />
        <Select
          label={t('categories.fields.parent')}
          data={[
            { value: NO_PARENT, label: t('categories.fields.noParent') },
            ...parents.map((parent) => ({ value: parent.id, label: parent.name })),
          ]}
          allowDeselect={false}
          disabled={hasChildren}
          description={hasChildren ? t('categories.fields.parentLocked') : undefined}
          {...form.getInputProps('parentId')}
        />
        <IconPicker
          label={t('categories.fields.icon')}
          value={form.values.icon}
          color={form.values.color}
          onChange={(icon) => form.setFieldValue('icon', icon)}
        />
        <ColorPicker
          label={t('categories.fields.color')}
          value={form.values.color}
          onChange={(color) => form.setFieldValue('color', color)}
        />
        {mutation.isError ? (
          <Alert color="red" variant="light" role="alert">
            {errorMessage(mutation.error)}
          </Alert>
        ) : null}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {t(current ? 'actions.save' : 'categories.create')}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

function DeleteCategoryModal({
  node,
  onClose,
}: {
  readonly node: Node | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const { remove } = useCategoryMutations();
  const errorMessage = useErrorMessage();
  const close = () => {
    remove.reset();
    onClose();
  };
  const count = node?.children.length ?? 0;
  return (
    <Modal opened={node !== null} onClose={close} title={t('categories.deleteTitle')} centered>
      <Text mb="lg">
        {node
          ? count > 0
            ? t('categories.deleteBodyWithChildren', { name: node.category.name, count })
            : t('categories.deleteBody', { name: node.category.name })
          : ''}
      </Text>
      {remove.isError ? (
        <Alert color="red" variant="light" role="alert" mb="md">
          {errorMessage(remove.error)}
        </Alert>
      ) : null}
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={close}>
          {t('actions.cancel')}
        </Button>
        <Button
          color="red"
          loading={remove.isPending}
          onClick={() =>
            node &&
            remove.mutate(node.category, {
              onSuccess: () => {
                notifications.show({ message: t('categories.deleted'), color: 'teal' });
                close();
              },
            })
          }
        >
          {t('actions.delete')}
        </Button>
      </Group>
    </Modal>
  );
}
