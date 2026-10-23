/** The card's designation and a whole edition number from 1, as /edition/<designation>/<n> names them; null for anything else. */
export function parseEdition(params: { designation: string; number: string }): { designation: string; number: number } | null {
  const designation = params.designation.toUpperCase()
  if (!/^[A-Z0-9-]{1,32}$/.test(designation) || !/^[0-9]{1,6}$/.test(params.number)) return null
  const number = Number(params.number)
  if (!Number.isInteger(number) || number < 1) return null
  return { designation, number }
}
