// tree-index.mjs — build lookup indexes over a parsed roadmap.
//
// Pure function, no side effects. Used by validate, render, picker, and the
// story-acceptance / followup machinery. Centralises tree traversal so each
// consumer doesn't reimplement "find the Story for this Task".
//
// Returns:
//   - taskToStory: Map<taskId, storyId>
//   - taskToEpic:  Map<taskId, epicId>
//   - storyToEpic: Map<storyId, epicId>
//   - storyTaskOrder: Map<storyId, taskId[]>    (document order within story)
//   - storyTerminals: Map<storyId, Set<taskId>> (explicit is_terminal:true OR
//                                                auto-derived topological leaves)
//
// Terminal derivation:
//   1. If any task in the story has is_terminal:true, use that set verbatim.
//   2. Otherwise, terminals = tasks not depended-on by any other task in the
//      same story. A story with parallel leaves (UI task + API task, neither
//      depending on the other) will have multiple terminals — Step 8.5's
//      acceptance check fires when ALL terminals are done.

export function buildIndex(roadmap) {
  const taskToStory = new Map();
  const taskToEpic = new Map();
  const storyToEpic = new Map();
  const storyTaskOrder = new Map();
  const storyTerminals = new Map();

  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      storyToEpic.set(story.id, epic.id);
      const order = [];
      for (const task of story.tasks || []) {
        taskToStory.set(task.id, story.id);
        taskToEpic.set(task.id, epic.id);
        order.push(task.id);
      }
      storyTaskOrder.set(story.id, order);
    }
  }

  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      const tasks = story.tasks || [];
      const explicit = tasks.filter((t) => t.is_terminal === true).map((t) => t.id);
      let terminals;
      if (explicit.length > 0) {
        terminals = new Set(explicit);
      } else {
        const localIds = new Set(tasks.map((t) => t.id));
        const dependedOn = new Set();
        for (const task of tasks) {
          for (const dep of task.depends_on || []) {
            if (localIds.has(dep)) dependedOn.add(dep);
          }
        }
        terminals = new Set();
        for (const task of tasks) {
          if (!dependedOn.has(task.id)) terminals.add(task.id);
        }
      }
      storyTerminals.set(story.id, terminals);
    }
  }

  return { taskToStory, taskToEpic, storyToEpic, storyTaskOrder, storyTerminals };
}

// Convenience: count of non-done tasks in a story, optionally excluding one.
export function storyRemaining(roadmap, storyId, excludeTaskId = null) {
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      if (story.id !== storyId) continue;
      let remaining = 0;
      for (const task of story.tasks || []) {
        if (task.id === excludeTaskId) continue;
        if (task.status !== 'done') remaining++;
      }
      return remaining;
    }
  }
  return null;
}

// Convenience: get the Story object by id (returns null if not found).
export function findStory(roadmap, storyId) {
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      if (story.id === storyId) return { epic, story };
    }
  }
  return null;
}
