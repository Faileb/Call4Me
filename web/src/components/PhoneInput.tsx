import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface CountryCode {
  code: string
  country: string
  flag: string
  format: (digits: string) => string
  maxDigits: number
}

const COUNTRY_CODES: CountryCode[] = [
  {
    code: '+1',
    country: 'US/CA',
    flag: '🇺🇸',
    format: (d) => {
      if (d.length <= 3) return d
      if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`
      return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`
    },
    maxDigits: 10,
  },
  {
    code: '+44',
    country: 'UK',
    flag: '🇬🇧',
    format: (d) => {
      if (d.length <= 4) return d
      if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`
      return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 11)}`
    },
    maxDigits: 10,
  },
  {
    code: '+61',
    country: 'AU',
    flag: '🇦🇺',
    format: (d) => {
      if (d.length <= 4) return d
      if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`
      return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 10)}`
    },
    maxDigits: 9,
  },
  {
    code: '+49',
    country: 'DE',
    flag: '🇩🇪',
    format: (d) => {
      if (d.length <= 4) return d
      return `${d.slice(0, 4)} ${d.slice(4, 11)}`
    },
    maxDigits: 11,
  },
  {
    code: '+33',
    country: 'FR',
    flag: '🇫🇷',
    format: (d) => {
      const parts = []
      for (let i = 0; i < d.length && i < 10; i += 2) {
        parts.push(d.slice(i, i + 2))
      }
      return parts.join(' ')
    },
    maxDigits: 9,
  },
  {
    code: '+81',
    country: 'JP',
    flag: '🇯🇵',
    format: (d) => {
      if (d.length <= 3) return d
      if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
      return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`
    },
    maxDigits: 10,
  },
  {
    code: '+52',
    country: 'MX',
    flag: '🇲🇽',
    format: (d) => {
      if (d.length <= 2) return d
      if (d.length <= 6) return `${d.slice(0, 2)} ${d.slice(2)}`
      return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6, 10)}`
    },
    maxDigits: 10,
  },
  {
    code: '+91',
    country: 'IN',
    flag: '🇮🇳',
    format: (d) => {
      if (d.length <= 5) return d
      return `${d.slice(0, 5)} ${d.slice(5, 10)}`
    },
    maxDigits: 10,
  },
]

interface PhoneInputProps {
  value: string // E.164 format or raw digits
  onChange: (e164Value: string) => void
  placeholder?: string
  className?: string
}

export function PhoneInput({ value, onChange, placeholder, className }: PhoneInputProps) {
  const [countryCode, setCountryCode] = useState<CountryCode>(COUNTRY_CODES[0])
  const [digits, setDigits] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // Parse incoming value (E.164 format)
  useEffect(() => {
    if (!value) {
      setDigits('')
      return
    }

    // Try to match country code from value
    for (const cc of COUNTRY_CODES) {
      if (value.startsWith(cc.code)) {
        setCountryCode(cc)
        setDigits(value.slice(cc.code.length).replace(/\D/g, ''))
        return
      }
    }

    // If no country code found, strip non-digits and use as-is
    setDigits(value.replace(/\D/g, ''))
  }, [value])

  const handleDigitsChange = (input: string) => {
    // Strip non-digits
    const rawDigits = input.replace(/\D/g, '').slice(0, countryCode.maxDigits)
    setDigits(rawDigits)

    // Emit E.164 format
    if (rawDigits) {
      onChange(`${countryCode.code}${rawDigits}`)
    } else {
      onChange('')
    }
  }

  const handleCountryChange = (cc: CountryCode) => {
    setCountryCode(cc)
    setShowDropdown(false)

    // Re-emit with new country code
    if (digits) {
      const trimmedDigits = digits.slice(0, cc.maxDigits)
      setDigits(trimmedDigits)
      onChange(`${cc.code}${trimmedDigits}`)
    }
  }

  const formattedDigits = countryCode.format(digits)

  return (
    <div className={`flex ${className || ''}`}>
      {/* Country Code Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-1 px-3 py-2 border border-gray-300 border-r-0 rounded-l-lg bg-gray-50 hover:bg-gray-100 focus:ring-2 focus:ring-primary-500 outline-none h-full"
        >
          <span className="text-lg">{countryCode.flag}</span>
          <span className="font-mono text-sm text-gray-600">{countryCode.code}</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px] max-h-64 overflow-y-auto">
              {COUNTRY_CODES.map((cc) => (
                <button
                  key={cc.code}
                  type="button"
                  onClick={() => handleCountryChange(cc)}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 text-left ${
                    cc.code === countryCode.code ? 'bg-primary-50' : ''
                  }`}
                >
                  <span className="text-lg">{cc.flag}</span>
                  <span className="font-mono text-sm">{cc.code}</span>
                  <span className="text-sm text-gray-500">{cc.country}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Phone Number Input */}
      <input
        type="tel"
        value={formattedDigits}
        onChange={(e) => handleDigitsChange(e.target.value)}
        placeholder={placeholder || countryCode.format('1234567890'.slice(0, countryCode.maxDigits))}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono"
      />
    </div>
  )
}
