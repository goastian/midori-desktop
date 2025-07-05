import pytest

URL = "https://www.wellcare.com/en/Oregon"
ALERT_CSS = ".alert-box"
MENU_CSS = "a[title='login DDL']"
SELECT_CSS = "select#userSelect"


async def is_fastclick_active(client):
    async with client.ensure_fastclick_activates():
        await client.navigate(URL, wait="load")
        # there can be multiple alerts
        while True:
            alert = client.find_css(ALERT_CSS)
            if not alert:
                break
            client.remove_element(alert)
        menu = client.await_css(MENU_CSS)
        client.soft_click(menu)
        return client.test_for_fastclick(
            client.await_css(SELECT_CSS, is_displayed=True)
        )


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert not await is_fastclick_active(client)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert await is_fastclick_active(client)
