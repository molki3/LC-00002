export default function Header() {
  const text1 = "⭠ Ir a Inicio"
  return (
    <header className="bg-yellow-600">
        <nav className="w-full text-center mx-auto py-5">
            <ul className="text-2xl">
                <li>
                    <a className="underline" href="/">{text1}</a>
                </li>
            </ul>
        </nav>
    </header>
  )
}
