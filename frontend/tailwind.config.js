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
                        /* getamano brand tokens */
                        brand: {
                                scooter: '#2F9D94',
                                alabaster: '#F7F6F2',
                                heather: '#BCC5CC',
                                lagoon: '#025F67',
                                sapphire: '#063154',
                                /* Section 71b — Teal/Midnight Green palette
                                   (unified with existing scooter/lagoon brand) */
                                'blue-dark':    '#011C40',
                                'blue-primary': '#024059',
                                'blue-accent':  '#0396A6',
                                'blue-light':   '#04BFBF',
                                'blue-surface': '#9CE3D5',
                        },
                        /* Override 'orange' so legacy classes map to Scooter teal scale */
                        orange: {
                                50:  '#EBF8F7',
                                100: '#D2F0EC',
                                200: '#A6E1DA',
                                300: '#74CFC5',
                                400: '#4EBAAE',
                                500: '#2F9D94',
                                600: '#207F77',
                                700: '#1B6962',
                                800: '#16544E',
                                900: '#134541',
                                950: '#0A2D29'
                        },
                        /* Override 'amber' to complement teal palette (toward Lagoon) */
                        amber: {
                                50:  '#E6F2F3',
                                100: '#CFE5E7',
                                200: '#9FCBCF',
                                300: '#6FB0B6',
                                400: '#3F969E',
                                500: '#025F67',
                                600: '#024F56',
                                700: '#023F45',
                                800: '#012F34',
                                900: '#011F22',
                                950: '#000F11'
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
