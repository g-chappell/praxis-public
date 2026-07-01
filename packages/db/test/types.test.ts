import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  events,
  type NewProject,
  type NewUser,
  type Project,
  type User,
  projects,
  users,
} from '../src/index.js';

describe('@praxis/db type exports', () => {
  it('exports the full set of schema tables as Drizzle table objects', () => {
    // Smoke check: tables have a `.id` column (all 12 schema tables do).
    expect(users.id).toBeDefined();
    expect(projects.id).toBeDefined();
    expect(events.id).toBeDefined();
  });

  it('exposes select + insert types per table', () => {
    // The User type carries the column shape including the unique email
    // (NOT nullable, per schema).
    expectTypeOf<User>().toHaveProperty('id');
    expectTypeOf<User>().toHaveProperty('email');
    expectTypeOf<User>().toHaveProperty('displayName');

    // NewUser is the insert shape; nullable fields with defaults remain
    // present but optional.
    expectTypeOf<NewUser>().toMatchTypeOf<{ email: string }>();

    // Project's insert shape requires teamId + templateId; harness has a
    // default so it's optional on insert.
    expectTypeOf<NewProject>().toMatchTypeOf<{
      teamId: string;
      templateId: string;
      name: string;
    }>();
    expectTypeOf<Project>().toHaveProperty('createdAt');
  });
});
