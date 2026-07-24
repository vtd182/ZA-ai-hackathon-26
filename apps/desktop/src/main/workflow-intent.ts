interface DiscoveryQuestionRef {
  id: string
}

function answerFromStructuredLine(line: string): string | null {
  const normalizedLine = line
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
  const separator = normalizedLine.indexOf(':')
  if (separator < 1) return null
  const answer = normalizedLine
    .slice(separator + 1)
    .trim()
    .replace(/^\*+|\*+$/g, '')
    .trim()
  return answer.length >= 1 && answer.length <= 240 ? answer : null
}

export function mapFreeformDiscoveryAnswers(
  questions: DiscoveryQuestionRef[],
  message: string,
): Record<string, string> | null {
  if (questions.length === 0) return null
  const answers = message
    .split(/\r?\n/)
    .map(answerFromStructuredLine)
    .filter((answer): answer is string => answer !== null)
  if (answers.length !== questions.length) return null
  return Object.fromEntries(questions.map((question, index) => [question.id, answers[index]!]))
}
