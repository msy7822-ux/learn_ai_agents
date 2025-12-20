from typing_extensions import TypedDict
from langgraph.graph import StateGraph


# Stateを宣言
class State(TypedDict):
    value: str


# Stateを引数としてGraphを初期化
graph = StateGraph(State)

from typing import TypedDict, Annotated


def reducer(a: list, b: int | None) -> int:
    # bが渡されたときは、aに追加する
    if b is not None:
        return a + [b]
    return a


class State(TypedDict):
    # Annotatedでstateを更新するreducerを指定する
    bar: Annotated[list[str], reducer]
