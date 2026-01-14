// Format an E.164 phone number for display
export function formatPhoneDisplay(e164: string): string {
  if (!e164) return ''

  // US/Canada: +1XXXXXXXXXX -> +1 XXX-XXX-XXXX
  if (e164.startsWith('+1') && e164.length === 12) {
    const digits = e164.slice(2)
    return `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  // UK: +44XXXXXXXXXX -> +44 XXXX XXX XXXX
  if (e164.startsWith('+44')) {
    const digits = e164.slice(3)
    if (digits.length >= 10) {
      return `+44 ${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    }
  }

  // Australia: +61XXXXXXXXX -> +61 XXXX XXX XXX
  if (e164.startsWith('+61')) {
    const digits = e164.slice(3)
    if (digits.length >= 9) {
      return `+61 ${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    }
  }

  // Germany: +49XXXXXXXXXXX -> +49 XXXX XXXXXXX
  if (e164.startsWith('+49')) {
    const digits = e164.slice(3)
    if (digits.length >= 4) {
      return `+49 ${digits.slice(0, 4)} ${digits.slice(4)}`
    }
  }

  // France: +33XXXXXXXXX -> +33 XX XX XX XX XX
  if (e164.startsWith('+33')) {
    const digits = e164.slice(3)
    const parts = []
    for (let i = 0; i < digits.length && i < 10; i += 2) {
      parts.push(digits.slice(i, i + 2))
    }
    return `+33 ${parts.join(' ')}`
  }

  // Mexico: +52XXXXXXXXXX -> +52 XX XXXX XXXX
  if (e164.startsWith('+52')) {
    const digits = e164.slice(3)
    if (digits.length >= 10) {
      return `+52 ${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`
    }
  }

  // Default: just return as-is or add spaces
  return e164
}
