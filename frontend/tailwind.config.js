/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
        extend: {
                borderRadius: {
                        lg: 'var(--radius)',
                        md: 'calc(var(--radius) - 2px)',
                        sm: 'calc(var(--radius) - 4px)'
                },
                colors: {
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
                        card: {
                                DEFAULT: 'hsl(var(--card))',
                                foreground: 'hsl(var(--card-foreground))'
                        },
                        popover: {
                                DEFAULT: 'hsl(var(--popover))',
                                foreground: 'hsl(var(--popover-foreground))'
                        },
                        primary: {
                                DEFAULT: 'hsl(var(--primary))',
                                foreground: 'hsl(var(--primary-foreground))'
                        },
                        secondary: {
                                DEFAULT: 'hsl(var(--secondary))',
                                foreground: 'hsl(var(--secondary-foreground))'
                        },
                        muted: {
                                DEFAULT: 'hsl(var(--muted))',
                                foreground: 'hsl(var(--muted-foreground))'
                        },
                        accent: {
                                DEFAULT: 'hsl(var(--accent))',
                                foreground: 'hsl(var(--accent-foreground))'
                        },
                        destructive: {
                                DEFAULT: 'hsl(var(--destructive))',
                                foreground: 'hsl(var(--destructive-foreground))'
                        },
                        border: 'hsl(var(--border))',
                        input: 'hsl(var(--input))',
                        ring: 'hsl(var(--ring))',
                        chart: {
                                '1': 'hsl(var(--chart-1))',
                                '2': 'hsl(var(--chart-2))',
                                '3': 'hsl(var(--chart-3))',
                                '4': 'hsl(var(--chart-4))',
                                '5': 'hsl(var(--chart-5))'
                        },
                        /* getamano brand tokens — Section 73b: re-aliased
                           to the Ocean Blue palette. Token NAMES kept stable
                           so existing components don't break; only HEX
                           values changed. New components should prefer
                           `blue-dark/primary/accent/light/surface` below. */
                        brand: {
                                scooter: '#0077B6',     /* primary CTA blue (was teal #2F9D94) */
                                alabaster: '#F8FCFD',   /* page bg, near-white w/ hint of blue (was cream) */
                                heather: '#BCC5CC',     /* neutral grey — kept */
                                lagoon: '#03045E',      /* deep navy (was dark teal #025F67) */
                                sapphire: '#03045E',    /* deep navy — same as lagoon (was #063154) */
                                /* Section 73 — Ocean Blue palette (canonical) */
                                'blue-dark':    '#03045E',
                                'blue-primary': '#0077B6',
                                'blue-accent':  '#00B4D8',
                                'blue-light':   '#90E0EF',
                                'blue-surface': '#CAF0F8',
                        },
                        /* Section 73b — `orange-*` legacy utilities re-aliased
                           to the new Atlantic Blue scale so any component
                           still using `text-orange-500`, `bg-orange-50`, etc.
                           automatically picks up the Ocean Blue palette. */
                        orange: {
                                50:  '#E6F4FA',
                                100: '#CCE9F5',
                                200: '#99D2EB',
                                300: '#66BCE1',
                                400: '#33A5D7',
                                500: '#0077B6',
                                600: '#00669B',
                                700: '#005580',
                                800: '#004466',
                                900: '#03045E',
                                950: '#02033A'
                        },
                        /* Section 73b — `amber-*` legacy utilities re-aliased
                           to navy gradient (matches the new dark accents). */
                        amber: {
                                50:  '#E6E7F2',
                                100: '#CDCFE5',
                                200: '#9B9FCC',
                                300: '#696FB2',
                                400: '#373F99',
                                500: '#03045E',
                                600: '#02034E',
                                700: '#02033E',
                                800: '#01022E',
                                900: '#01021F',
                                950: '#000110'
                        }
                },
                keyframes: {
                        'accordion-down': {
                                from: {
                                        height: '0'
                                },
                                to: {
                                        height: 'var(--radix-accordion-content-height)'
                                }
                        },
                        'accordion-up': {
                                from: {
                                        height: 'var(--radix-accordion-content-height)'
                                },
                                to: {
                                        height: '0'
                                }
                        }
                },
                animation: {
                        'accordion-down': 'accordion-down 0.2s ease-out',
                        'accordion-up': 'accordion-up 0.2s ease-out'
                },
                fontFamily: {
                        /* Section 71 — Poppins is the new official font */
                        poppins: ['Poppins', 'sans-serif'],
                }
        }
  },
  plugins: [require("tailwindcss-animate")],
};
