const PEOPLE = [
  { id: 'mama', name: 'Mama', avatarKind: 'girl', initial: 'M' },
  { id: 'cj', name: 'CJ', avatarKind: 'boy', initial: 'C' },
  { id: 'bea', name: 'Bea', avatarKind: 'girl', initial: 'B' },
]

function personFromId(id) {
  return PEOPLE.find((person) => person.id === id) ?? null
}

function profileFromPerson(id, currentProfile = {}) {
  const person = personFromId(id)
  if (!person) {
    return {
      ...currentProfile,
      personId: null,
      avatarKind: currentProfile.avatarKind ?? 'boy',
    }
  }

  return {
    ...currentProfile,
    personId: person.id,
    name: person.name,
    initial: person.initial,
    avatarKind: person.avatarKind,
  }
}