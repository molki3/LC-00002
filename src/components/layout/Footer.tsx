export default function Footer() {
  const text1 = "⭠ Ir al Inicio"
  return (
    <header className="bg-yellow-600">
        <nav className="w-full text-center mx-auto py-5">
            <ul className="text-lg">
                <li>
                    <a className="underline" href="/">{text1}</a>
                </li>
            </ul>
        </nav>
    </header>
  )
}