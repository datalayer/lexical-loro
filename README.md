# Lexical Loro

```
EDITOR 1                                           EDITOR 2

loro                                               loro
- node(data: root(1))                              - node(data: root(12))
  - node(data: element(2))                           - node(data: element(22))
    - node(data: text(3))                              - node(data: text(13))
  - node(data: counter(4))                           - node(data: counter(4))

                <---- loro updates via websocket ------>
                <---- loro node ids are the same ------>
             <---- lexical node keys are different ------>

lexical                                            lexical
- root(1)                                          - root(12)
  - element(2)                                       - element(22)
    - text(3)                                          - text(13)
  - counter(4)                                       - counter(49)
```

## Loro Examples

- http://localhost:3000/?isCollab=true

- http://localhost:3000/split/?isCollab=true

## Y.js Examples

- http://localhost:3000/?isCollab=true&useYjs=true

- http://localhost:3000/split/?isCollab=true&useYjs=true
