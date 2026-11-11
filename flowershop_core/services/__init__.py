"""Business services. Every write takes ``actor`` ("owner", "owner(chat)",
"agent:<department>", "system", "demo-seed") and runs inside ``Store.tx()``.

Public functions take a ``Store`` first. ``_impl`` variants take an open ``Tx`` so the
approval executor can run an action and record the decision in ONE transaction.
"""
