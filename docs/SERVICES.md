# flowershop_core service signatures (generated — the ONLY functions adapters may call)

Import: `from flowershop_core import get_store` → `s = get_store()`; pass `s` first. All raise `flowershop_core.errors.FlowerShopError` subclasses (`.code`, `.http_status`, `.to_dict()`).

## flowershop_core.services.profile
```python
complete_step(s: 'Store', step: 'str', data: 'dict | None' = None, actor: 'str' = 'owner') -> 'dict'
get(s: 'Store') -> 'dict'
onboarding(s: 'Store') -> 'dict'
update(s: 'Store', data: 'dict', actor: 'str' = 'owner') -> 'dict'
```
## flowershop_core.services.orders
```python
availability(s: 'Store', ref) -> 'dict'
cancel(s: 'Store', ref, reason: 'str', actor: 'str' = 'owner') -> 'dict'
confirm(s: 'Store', ref, actor: 'str' = 'owner', note: 'str | None' = None) -> 'dict'
create_draft(s: 'Store', data: 'dict', actor: 'str' = 'owner') -> 'dict'
get_order(s: 'Store', ref) -> 'dict'
list_customers(s: 'Store', q: 'str | None' = None, limit: 'int' = 50) -> 'dict'
list_orders(s: 'Store', status: 'str | None' = None, q: 'str | None' = None, due: 'str | None' = None, limit: 'int' = 50, offset: 'int' = 0) -> 'dict'
transition(s: 'Store', ref, to_status: 'str', actor: 'str' = 'owner', reason: 'str | None' = None) -> 'dict'
update_draft(s: 'Store', ref, data: 'dict', actor: 'str' = 'owner') -> 'dict'
```
## flowershop_core.services.inventory
```python
adjust_stock(s: 'Store', ref, data: 'dict', actor: 'str' = 'owner') -> 'dict'
create_item(s: 'Store', data: 'dict', actor: 'str' = 'owner') -> 'dict'
create_recipe(s: 'Store', data: 'dict', actor: 'str' = 'owner') -> 'dict'
get_item(s: 'Store', ref, movements: 'int' = 50) -> 'dict'
list_items(s: 'Store', category: 'str | None' = None, q: 'str | None' = None, low: 'bool' = False, include_inactive: 'bool' = False) -> 'dict'
list_recipes(s: 'Store', include_inactive: 'bool' = False) -> 'dict'
receive_stock(s: 'Store', ref, data: 'dict', actor: 'str' = 'owner') -> 'dict'
record_wastage(s: 'Store', ref, data: 'dict', actor: 'str' = 'owner') -> 'dict'
```
## flowershop_core.services.production
```python
advance(s: 'Store', ref, data: 'dict | None' = None, actor: 'str' = 'owner') -> 'dict'
list_tasks(s: 'Store', status: 'str | None' = None, active: 'bool' = True) -> 'dict'
```
## flowershop_core.services.delivery
```python
list_deliveries(s: 'Store', status: 'str | None' = None, date: 'str | None' = None) -> 'dict'
schedule(s: 'Store', order_ref, data: 'dict', actor: 'str' = 'owner') -> 'dict'
update_status(s: 'Store', ref, status: 'str', notes: 'str | None' = None, actor: 'str' = 'owner') -> 'dict'
```
## flowershop_core.services.finance
```python
estimate(s: 'Store', ref) -> 'dict'
list_expenses(s: 'Store', frm: 'str | None' = None, to: 'str | None' = None) -> 'dict'
record_expense(s: 'Store', data: 'dict', actor: 'str' = 'owner') -> 'dict'
record_payment(s: 'Store', data: 'dict', actor: 'str' = 'owner') -> 'dict'
summary(s: 'Store', frm: 'str | None' = None, to: 'str | None' = None) -> 'dict'
```
## flowershop_core.services.approvals
```python
approve(s: 'Store', ref, actor: 'str' = 'owner', note: 'str | None' = None) -> 'dict'
get(s: 'Store', ref) -> 'dict'
list_approvals(s: 'Store', status: 'str | None' = 'PENDING', limit: 'int' = 100) -> 'dict'
reject(s: 'Store', ref, actor: 'str' = 'owner', reason: 'str | None' = None) -> 'dict'
request(s: 'Store', action: 'str', payload: 'dict', actor: 'str', note: 'str | None' = None) -> 'dict'
```
## flowershop_core.services.studio
```python
attach(s: 'Store', data: 'dict', actor: 'str' = 'owner') -> 'dict'
image_path(s: 'Store', ref) -> 'Path'
list_designs(s: 'Store', order_id=None) -> 'dict'
```
## flowershop_core.services.insights
```python
audit_list(s: 'Store', entity_type: 'str | None' = None, entity_id=None, actor: 'str | None' = None, limit: 'int' = 50) -> 'dict'
floor(s: 'Store') -> 'dict'
overview(s: 'Store') -> 'dict'
playbook(s: 'Store') -> 'dict'
team(s: 'Store') -> 'dict'
```
## flowershop_core.seed
```python
clear_demo(s: 'Store') -> 'dict'
counts(s: 'Store') -> 'dict'
seed_demo(s: 'Store', reset: 'bool' = False) -> 'dict'
```
