let knowledgeRevision = 0

export function currentAssistantKnowledgeRevision(): number {
  return knowledgeRevision
}

export function bumpAssistantKnowledgeRevision(): void {
  knowledgeRevision += 1
}
