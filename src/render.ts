import {ParsedType, parse, renderAsText, summarize} from "@welshman/content"
import type {Parsed} from "@welshman/content"
import type {TrustedEvent} from "@welshman/util"

const splitLines = (parsed: Parsed[]) => {
  const lines: Parsed[][] = [[]]

  for (const node of parsed) {
    if (node.type === ParsedType.Newline) {
      lines.push([])
    } else {
      lines[lines.length - 1].push(node)
    }
  }

  return lines.filter(line => line.length > 0)
}

const hasProse = (line: Parsed[]) =>
  line.some(node => node.type === ParsedType.Text && node.value.trim().length > 0)

// A reply prepends the message it answers, so the first line of one describes the quote and says
// nothing about the reply. The first line carrying words of its own is what the message is about.
export const renderEventAsSummary = (event: TrustedEvent) => {
  const lines = splitLines(parse(event))
  const line = lines.find(hasProse) || lines[0] || []

  return renderAsText(summarize(line)).toString().trim()
}
