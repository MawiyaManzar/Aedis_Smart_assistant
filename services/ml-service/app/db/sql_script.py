"""Split PostgreSQL scripts without breaking dollar-quoted function bodies."""


def split_sql(script: str) -> list[str]:
    """Return executable statements from a SQL script."""
    statements: list[str] = []
    current: list[str] = []
    index = 0
    length = len(script)
    while index < length:
        if script.startswith("--", index):
            newline = script.find("\n", index)
            if newline == -1:
                break
            index = newline + 1
            continue
        if script.startswith("$$", index):
            end = script.find("$$", index + 2)
            if end == -1:
                raise ValueError("unterminated dollar-quoted string in SQL script")
            current.append(script[index : end + 2])
            index = end + 2
            continue
        if script[index] == ";":
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            index += 1
            continue
        current.append(script[index])
        index += 1
    tail = "".join(current).strip()
    if tail:
        statements.append(tail)
    return statements
