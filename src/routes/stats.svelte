<script>
  /**
   * Stats Route
   * This is stupid big... still needs to be organized
   * SERIOUSLY BIG
   *
   */

  //Vendors
  import { navigate } from "svelte-routing";
  import dayjs from "dayjs";

  // Utils
  import math from "../utils/math/math";
  import NomieUOM from "../utils/nomie-uom/nomie-uom";
  import Logger from "../utils/log/log";

  // Modules
  import Tracker from "../modules/tracker/tracker";
  // import CalendarMap from "../utils/calendar-map/calendar-map";
  import Storage from "../modules/storage/storage";
  import StatsProcessor from "../modules/stats/stats";

  // Components
  import ButtonGroup from "../components/button-group/button-group.svelte";
  import Spinner from "../components/spinner/spinner.svelte";
  import NText from "../components/text/text.svelte";
  import NCell from "../components/cell/cell.svelte";
  import Modal from "../components/modal/modal.svelte";
  // import NItem from "../components/list-item/list-item.svelte";
  import BarChart from "../components/charts/bar-chart.svelte";
  // import Tabs from "../components/board-tabs/board-tabs.svelte";
  import NPopcard from "../components/popcard/popcard.svelte";
  // import NToolbar from "../components/toolbar/toolbar.svelte";
  import NLogItem from "../components/list-item-log/list-item-log.svelte";
  import NTimeGrid from "../components/day-time-grid/day-time-grid.svelte";
  import KVBlock from "../components/kv-block/kv-block.svelte";

  // containers
  import NPage from "../containers/layout/page.svelte";
  import NMap from "../containers/map/map.svelte";
  import NCalendar from "../containers/calendar/sweet.svelte";

  //store
  // import { BoardStore } from "../store/boards";
  import { UserStore } from "../store/user";
  import { TrackerStore } from "../store/trackers";
  import { LedgerStore } from "../store/ledger";
  import { Interact } from "../store/interact";
  import { HistoryPage } from "../store/history-page";
  import { Lang } from "../store/lang";

  const console = new Logger("📊 Stats.svelte");

  // Local
  let refreshing = false; // Used to show and hide things while loading
  let rows = [];
  let statBodyDom; // Get the stat body for height reference (chart heights)
  let domVisible = false; // if the dom show should (for animations opposed to if else)

  let statStorage = Storage.local.get("stats-view") || {}; // Store user preferences

  let state = {
    date: dayjs(), // default to today - use dayjs object
    tracker: null,
    view: statStorage.view, // day month year
    subview: statStorage.subview, // what sub view (chart map logs)
    stats: null, // holds stats for this tracker
    compare: {
      tracker: null,
      stats: null
    },
    tag: null, // holder of the tag for this tracker
    vsChartPoints: null, // holder of compare points
    chartHeight: 200 // default chart height - set to height of statBodyDom
  };

  /**
   * Fake onMount()
   * Checks to see if state.tag is a match - if not, we know it's the first
   */
  $: if ($Interact.stats.activeTag !== state.tag && $Interact.stats.activeTag) {
    let tagViewSettings = statStorage[$Interact.stats.activeTag] || {
      view: "month",
      subview: "chart"
    };
    setTimeout(() => {
      if (statBodyDom) {
        state.chartHeight = statBodyDom.offsetHeight * 0.9;
      }
    }, 500);
    domVisible = true;
    state.date = dayjs();
    state.tag = $Interact.stats.activeTag;
    state.view = tagViewSettings.view;
    state.subview = tagViewSettings.subview;
    state.tracker =
      $TrackerStore[$Interact.stats.activeTag] ||
      new Tracker({ tag: $Interact.stats.activeTag });
    methods.load();
  } else if (!$Interact.stats.activeTag && state.tag) {
    /**
     * Fake onDestory()
     * Checks to see if state.tag is a match - if not, we know it's the first
     */
    state.date = dayjs();
  }

  const methods = {
    showHistory() {
      navigate("/history");
      setTimeout(() => {
        $HistoryPage.date = state.date;
      }, 10);
    },
    saveView() {
      let view = {
        view: state.view,
        subview: state.subview
      };
      statStorage[$Interact.stats.activeTag] = view;
      Storage.local.put("stats-view", statStorage);
    },
    changeView(mode) {
      state.view = mode;
      if (
        state.view == "year" &&
        ["map", "chart", "grid"].indexOf(state.subview) == -1
      ) {
        state.subview = "chart";
      } else if (
        state.view == "month" &&
        ["map", "logs", "streak", "grid", "chart"].indexOf(state.subview) == -1
      ) {
        state.subview = "chart";
      } else if (
        state.view == "day" &&
        ["map", "logs", "chart", "all-logs"].indexOf(state.subview) == -1
      ) {
        state.subview = "map";
      }

      methods.saveView();

      if (state.date.year() !== dayjs().year()) {
        methods.load();
      } else {
        methods.refresh();
      }
    },
    getGridRows() {
      if (state.view == "month") {
        let start = state.date
          .startOf("month")
          .toDate()
          .getTime();
        let end = state.date
          .endOf("month")
          .toDate()
          .getTime();
        return rows.filter(row => {
          return row.end > start && row.end < end;
        });
      } else {
        return rows;
      }
    },
    changeSubview(mode) {
      state.subview = mode;
      methods.saveView();
    },
    getChartLabels() {
      let view = state.view == "year" ? "year" : "month";
      let labels = state.stats.results[view].chart.labels || [];
      return labels;
    },
    getChartPoints() {
      let view = state.view == "year" ? "year" : "month";
      let points = state.stats.results[view].chart.points || [];
      return points;
    },
    /**
     * Generate the Stat Chart Points
     * for the compare tracker
     */
    getVsChartPoints() {
      return new Promise((resolve, reject) => {
        if (state.compare.tracker) {
          setTimeout(() => {
            let view = state.view == "year" ? "year" : "month";
            state.vsChartPoints = state.compare.stats.results
              ? state.compare.stats.results[view].chart.points
              : null;
          }, 100);
        }
      });
      // return [];
    },
    activeIndex() {
      if (state.view == "year") {
        return state.date.month() + 1;
      } else {
        return state.date.date();
      }
    },
    getDayLogs() {
      return new Promise((resolve, reject) => {
        LedgerStore.query({
          start: state.date.startOf("day").toDate(),
          end: state.date.endOf("day").toDate()
        }).then(logs => {
          logs = logs.map(log => {
            log.expanded();
            return log;
          });
          resolve(logs);
        });
      });
    },
    xFormat(x) {
      if (state.view == "year") {
        return dayjs(x).format("MMM");
      } else {
        return x % 2 ? x : "";
      }
    },
    load() {
      let tracker =
        $TrackerStore[$Interact.stats.activeTag] ||
        new Tracker({ tag: $Interact.stats.activeTag });
      refreshing = true;
      methods.getStats(tracker).then(res => {
        rows = res.rows;
        state.stats = res.stats;
        if (state.compare.tracker) {
          methods.getStats(state.compare.tracker).then(compareRes => {
            state.compare.stats = compareRes.stats;
            state.compare.rows = compareRes.rows;
            setTimeout(() => {
              if (statBodyDom) {
                state.chartHeight = statBodyDom.offsetHeight * 0.47;
              }
            }, 120);
            methods.getVsChartPoints();
            refreshing = false;
          });
        } else {
          refreshing = false;
        }
      });
      // Get Logs for the year and tag
    },
    getStats(tracker) {
      return LedgerStore.search(
        `#${tracker.tag}`,
        state.date.format("YYYY")
      ).then(resRows => {
        // Expand Logs
        resRows = resRows.map(log => {
          log.expanded();
          return log;
        });
        // Initialize the Stats OverView
        let stats = new StatsProcessor(
          resRows,
          tracker,
          state.date,
          "getStats(" + tracker.tag + ")"
        );
        return {
          stats,
          rows: resRows
        };
      });
    },
    previous() {
      state.date = state.date.subtract(1, "year");
      methods.load();
    },
    next() {
      state.date = state.date.add(1, "year");
      methods.load();
    },
    compare() {
      Interact.selectTracker().then(tracker => {
        setTimeout(() => {
          state.compare.tracker = tracker;
          methods.load();
        }, 20);
      });
    },
    // methods.getStats(state.compare.tracker).then(compareRes => {
    //   state.compare.stats = compareRes.stats;
    //   state.compare.rows = compareRes.rows;
    //   if (statBodyDom) {
    //     state.chartHeight = statBodyDom.offsetHeight * 0.47;
    //   }
    // });
    removeCompare() {
      state.compare.stats = null;
      state.compare.tracker = null;
      state.compare.rows = null;
    },
    previousMonth() {
      let thisYear = state.date.year();
      state.date = state.date.subtract(1, "month");
      if (state.date.year() !== thisYear) {
        methods.load();
      } else {
        methods.refresh();
      }
    },
    nextMonth() {
      let thisYear = state.date.year();
      state.date = state.date.add(1, "month");
      if (state.date.year() !== thisYear) {
        methods.load();
      } else {
        methods.refresh();
      }
    },
    previousDay() {
      let thisYear = state.date.year();
      state.date = state.date.subtract(1, "day");
      if (state.date.year() !== thisYear) {
        methods.load();
      } else {
        methods.refresh();
      }
    },
    nextDay() {
      let thisYear = state.date.year();
      state.date = state.date.add(1, "day");
      if (state.date.year() !== thisYear) {
        methods.load();
      } else {
        methods.refresh();
      }
    },

    refresh() {
      methods.getVsChartPoints();
      state.stats.gotoDate(state.date);
      if (state.compare.stats) {
        state.compare.stats.gotoDate(state.date);
      }

      refreshing = true;
      setTimeout(() => {
        refreshing = false;
      }, 1);
    },
    show(date) {
      state.date = date;
      state.view = "day";
      state.subview = "logs";
      this.refresh();
    },
    getValueMap(rows) {
      let valueMap = {};
      rows.forEach(row => {
        let dayKey = dayjs(row.end).format("YYYY-MM-DD");
        valueMap[dayKey] = valueMap[dayKey] || [];
        if (row.trackers[state.tracker.tag]) {
          valueMap[dayKey].push(row.trackers[state.tracker.tag].value);
        }
      });
      return valueMap;
    },
    /**
     * Get Chart Data - IMPORTANT and Sloppy
     * TODO: Needs to be refactored and cleaned up
     */
    aboveOrBelow(ths, tht) {
      return new Promise((resolve, reject) => {
        resolve({
          direction: ths > tht ? "above" : ths === tht ? "same" : "below",
          amount: math.round(100 - math.percentage(ths, tht))
        });
      });
    },
    close() {
      domVisible = false;
      setTimeout(() => {
        Interact.closeStats();
      }, 600);
    },
    getCalendarData(mode) {
      let rows = state.stats.getRows(mode).map(row => {
        row.start = new Date(row.start);
        row.end = new Date(row.end);
        row.repeat = "never";
        return row;
      });
      return rows;
    },
    getLocationSummary(type) {
      type = type || "year";
      let locations = {};
      state.stats.getRows(type).forEach(row => {
        if (row.lat) {
          let key = `${math.round(row.lat, 1000)},${math.round(row.lng, 1000)}`;
          locations[key] = locations[key] || { lat: row.lat, lng: row.lng };
        }
      });
      return Object.keys(locations).map(key => {
        return locations[key];
      });
    }
  };

  // onMount(() => {

  // });
  // onDestroy(() => {

  // });
</script>

<style lang="scss">
  .data-blocks {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    flex-wrap: nowrap;
  }
  .border-bottom {
    border-bottom: solid 1px var(--color-faded-1) !important;
  }

  .stat-view-body {
    flex-grow: 1;
    min-height: 100%;
    height: 100%;
    background-color: var(--color-bg);
  }

  .loading-main {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-grow: 1;
    flex-shrink: 1;
    height: 100%;
  }

  .sticky-header {
    background: var(--color-bg);
    position: -webkit-sticky;
    position: sticky;
    top: 50px;
    z-index: 1000;
  }

  .subheader {
    background: var(--color-bg) !important;
  }
  .stat-topbar {
    text-align: center;
    padding-bottom: 6px;
    justify-content: center;
    font-size: 12px;
    background-color: transparent !important;
    margin-left: -11px;
    margin-top: -11px;
    padding-top: 9px;
    margin-bottom: 5px;
    width: calc(100% + 22px);
    border-top-left-radius: 0.6rem;
    border-top-right-radius: 0.6rem;
  }

  :global(.stats-modal .n-modal) {
    width: 96vw;
    max-width: 600px;
    height: 86vh !important;
    min-height: 540px !important;
    max-height: 700px !important;
  }
  :global(.stats-modal .n-modal .n-modal-body) {
    padding: 0 !important;
    // min-height: 120px;
    height: 100%;
  }
</style>

<Modal className="stats-modal" show={domVisible} type="bottom-slideup">
  <header
    slot="header"
    class="n-column w-100 stats-header"
    on:swipedown={methods.close}>
    <div
      class="stat-topbar n-row f-grow"
      style="background-color:{state.tracker.color}"
      on:swipedown={methods.close}>
      {#if state.tracker}
        <button class="btn btn-clear btn-sm" on:click={methods.compare}>
          {state.tracker.emoji} {state.tracker.label}
          {#if state.compare.tracker}
            <span class="mx-2">vs</span>
            {state.compare.tracker.emoji} {state.compare.tracker.label}
          {:else}
            <button class="badge badge-light ml-2">Vs</button>
          {/if}
        </button>
      {:else}
        <Spinner size="16" />
        Loading...
      {/if}
    </div>
    <div class="stat-header n-row f-grow">
      <button
        class="btn btn-clear btn-icon zmdi zmdi-close"
        on:click={methods.close} />
      <!-- View Button Group -->
      <div class="mx-2 filler">
        <ButtonGroup
          size="sm"
          buttons={[{ label: 'Day', active: state.view === 'day', click() {
                methods.changeView('day');
              } }, { label: 'Month', active: state.view === 'month', click() {
                methods.changeView('month');
              } }, { label: 'Year', active: state.view === 'year', click() {
                methods.changeView('year');
              } }]} />
      </div>

      <button
        class="btn btn-clear btn-icon zmdi zmdi-edit"
        on:click={() => {
          Interact.editTracker(state.tracker).then(() => {});
        }} />
    </div>

    <div class="stat-sub-header n-row pt-2">
      {#if state.view == 'year'}
        <button class="btn btn-clear" on:click={methods.previous}>
          <i class="zmdi zmdi-chevron-left font-140 mr-2" />
          {state.date.subtract(1, 'year').format('YYYY')}
        </button>
        <h1 class="n-title filler text-center">{state.date.format('YYYY')}</h1>
        <button class="btn btn-clear" on:click={methods.next}>
          {state.date.add(1, 'year').format('YYYY')}
          <i class="zmdi zmdi-chevron-right font-140 ml-2" />
        </button>
      {:else if state.view == 'month'}
        <button class="btn btn-clear" on:click={methods.previousMonth}>
          <i class="zmdi zmdi-chevron-left font-140 mr-2" />
          {state.date.subtract(1, 'month').format('MMM')}
        </button>
        <h1 class="n-title filler text-center">
          {state.date.format('MMM YYYY')}
        </h1>
        <button class="btn btn-clear" on:click={methods.nextMonth}>
          {state.date.add(1, 'month').format('MMM')}
          <i class="zmdi zmdi-chevron-right font-140 ml-2" />
        </button>
      {:else if state.view == 'day'}
        <button class="btn btn-clear" on:click={methods.previousDay}>
          <i class="zmdi zmdi-chevron-left font-140 mr-2" />
          {state.date.subtract(1, 'day').format('ddd')}
        </button>
        <NCell direction="column" className="text-center">
          <NText size="sm" className="font-bold">
            {state.date.format('ddd MMM D YYYY')}
          </NText>
          {#if state.date.toDate().toDateString() !== new Date().toDateString()}
            <NText size="xs">{state.date.fromNow()}</NText>
          {:else}
            <NText size="xs">Today</NText>
          {/if}
        </NCell>
        <button class="btn btn-clear" on:click={methods.nextDay}>
          {state.date.add(1, 'day').format('ddd')}
          <i class="zmdi zmdi-chevron-right font-140 ml-2" />
        </button>
      {/if}
    </div>
    <!-- end sub-header -->
    <!-- Start Value Header-->
    {#if state.stats}
      <div class="n-row data-blocks py-2">
        {#if state.view == 'year'}
          {#if state.tracker.math === 'sum'}
            <KVBlock
              type="box"
              label="Total"
              value={NomieUOM.format(math.round(state.stats.results.year.sum, 1000), state.tracker.uom)} />
          {:else}
            <KVBlock
              type="box"
              label="Year Avg"
              value={NomieUOM.format(math.round(state.stats.results.year.avg, 1000), state.tracker.uom)} />
          {/if}
          {#if state.stats.results.year.max}
            <KVBlock
              type="box"
              onClick={() => {
                methods.show(state.stats.results.year.max.date);
              }}
              label="Max {(state.stats.results.year.max.date || dayjs()).format('MMM D')}"
              value={NomieUOM.format(math.round(state.stats.results.year.max.value, 10), state.tracker.uom)} />
          {/if}
        {:else if state.view == 'month'}
          {#if state.tracker.math === 'sum'}
            <KVBlock
              type="box"
              label="{state.date.format('MMM')} Total"
              value={NomieUOM.format(math.round(state.stats.results.month.sum || 0, 1000), state.tracker.uom)} />
          {:else}
            <KVBlock
              type="box"
              label="{state.date.format('MMM')} Avg"
              value={NomieUOM.format(math.round(state.stats.results.month.avg || 0, 1000), state.tracker.uom)} />
          {/if}

          {#if state.stats.results.month.max.value}
            <KVBlock
              type="box"
              label="Max {(state.stats.results.month.max.date || dayjs()).format('MMM D')}"
              value={NomieUOM.format(math.round(state.stats.results.month.max.value, 10), state.tracker.uom)} />
          {/if}
          <KVBlock
            type="box"
            label="Daily Avg"
            value={NomieUOM.format(math.round(state.stats.results.month.avg, 10), state.tracker.uom)} />
        {:else if state.view == 'day'}
          {#if state.tracker.math === 'sum'}
            {#await methods.aboveOrBelow(state.stats.results.day.sum, state.stats.results.month.avg) then aob}
              <KVBlock
                type="box"
                value={NomieUOM.format(state.stats.results.day.sum || 0, state.tracker.uom)}>
                <div slot="label">
                  {state.date.format('ddd')}
                  {#if aob.direction != 'same' && isFinite(aob.amount)}
                    <div class="change">
                      <span
                        class="zmdi {aob.direction === 'above' ? 'zmdi-triangle-up' : 'zmdi-triangle-down'}" />
                      {aob.amount}%
                    </div>
                  {/if}
                </div>
              </KVBlock>
              {#if state.compare.stats}
                <KVBlock
                  type="box"
                  label={state.compare.tracker.emoji}
                  value={NomieUOM.format(state.compare.stats.results.day.sum || 0, state.compare.tracker.uom)} />
              {/if}
            {/await}
          {:else}
            {#await methods.aboveOrBelow(state.stats.results.day.sum, state.stats.results.month.avg) then aob}
              <KVBlock
                type="box"
                value={NomieUOM.format(state.stats.results.day.avg, state.tracker.uom) || '~'}>
                <div slot="label">Day</div>
              </KVBlock>
            {/await}
          {/if}
        {/if}
      </div>
    {/if}
    <!-- End Value Header-->
    <!-- Start button group-->
    <div class="n-row py-2">
      {#if state.view == 'year'}
        <ButtonGroup
          size="sm"
          buttons={[{ label: Lang.t('general.map'), active: state.subview == 'map', click() {
                methods.changeSubview('map');
              } }, { label: Lang.t('stats.chart'), active: state.subview == 'chart', click() {
                methods.changeSubview('chart');
              } }, { label: Lang.t('general.time'), active: state.subview == 'grid', click() {
                methods.changeSubview('grid');
              } }]} />
      {:else if state.view == 'month'}
        <ButtonGroup
          size="sm"
          buttons={[{ label: Lang.t('general.map'), active: state.subview == 'map', click() {
                methods.changeSubview('map');
              } }, { label: Lang.t('stats.chart'), active: state.subview == 'chart', click() {
                methods.changeSubview('chart');
              } }, { label: Lang.t('general.time'), active: state.subview == 'grid', click() {
                methods.changeSubview('grid');
              } }, { label: Lang.t('stats.logs'), active: state.subview == 'logs', click() {
                methods.changeSubview('logs');
              } }, { label: Lang.t('stats.streak'), active: state.subview == 'calendar', click() {
                methods.changeSubview('calendar');
              } }]} />
      {:else if state.view == 'day'}
        <ButtonGroup
          size="sm"
          buttons={[{ label: Lang.t('general.map'), active: state.subview == 'map', click() {
                methods.changeSubview('map');
              } }, { label: Lang.t('stats.chart'), active: state.subview == 'chart', click() {
                methods.changeSubview('chart');
              } }, { label: Lang.t('stats.logs'), active: state.subview == 'logs', click() {
                methods.changeSubview('logs');
              } }, { label: Lang.t('stats.all-logs'), active: state.subview == 'all-logs', click() {
                methods.changeSubview('all-logs');
              } }]} />
      {/if}
    </div>
    <!-- end button grouo-->
  </header>

  {#if !refreshing}
    <main class="stat-view-body {state.mode}-view" bind:this={statBodyDom}>

      <!-- START STAT COMPONENT VIEWS -->
      {#if state.subview === 'chart'}
        <div class="p-2">
          <BarChart
            title={`${state.tracker.emoji} ${state.tracker.label}`}
            height={state.chartHeight}
            color={state.tracker.color}
            labels={methods.getChartLabels()}
            points={methods.getChartPoints()}
            on:tap={event => {
              let newDate;
              state.date = dayjs(event.detail.point.date);
              methods.refresh();
            }}
            xFormat={methods.xFormat}
            yFormat={y => {
              return NomieUOM.format(y, state.tracker.uom);
            }}
            activeIndex={methods.activeIndex()} />
          {#if state.vsChartPoints}
            <div class="mt-1" />
            <BarChart
              height={state.chartHeight}
              title={`${state.compare.tracker.emoji} ${state.compare.tracker.label}`}
              color={state.compare.tracker.color}
              labels={methods.getChartLabels()}
              points={state.vsChartPoints}
              on:tap={event => {
                let newDate;
                state.date = dayjs(event.detail.point.date);
                methods.refresh();
              }}
              xFormat={methods.xFormat}
              yFormat={y => {
                return NomieUOM.format(y, state.compare.tracker.uom);
              }}
              activeIndex={methods.activeIndex()} />
          {/if}
        </div>
      {:else if state.subview === 'grid'}
        <NTimeGrid color={state.tracker.color} rows={methods.getGridRows()} />
      {:else if state.subview === 'map'}
        <NMap
          small
          locations={state.stats.getLocations(state.view)}
          height={250} />
      {:else if state.subview === 'calendar'}
        <div class="p-3">
          <NCalendar
            color={state.tracker.color}
            tracker={state.tracker}
            showHeader={false}
            on:dayClick={event => {
              state.date = dayjs(event.detail);
              methods.refresh();
            }}
            initialDate={state.date}
            events={methods.getCalendarData('month')} />
        </div>
      {:else if state.subview === 'logs'}
        <div class="n-list">
          {#if state.stats.getRows(state.view).length === 0}
            <div class="empty-notice sm">No logs found on this day.</div>
          {/if}
          {#each state.stats.getRows(state.view) as log, index}
            {#if log.trackers[state.tracker.tag]}
              <NLogItem
                {log}
                className="compact"
                fullDate={true}
                on:locationClick={event => {
                  Interact.showLocations([log]);
                }}
                on:moreClick={event => {
                  Interact.logOptions(log).then(() => {});
                }}
                show24Hour={$UserStore.meta.is24Hour}
                trackers={$TrackerStore}
                focus={state.tracker.tag} />
            {/if}
          {/each}
        </div>
      {:else if state.subview === 'all-logs'}
        <div class="n-list">
          {#await methods.getDayLogs()}
            <div class="empty-notice sm">Getting logs...</div>
          {:then logs}
            {#each logs as log, index}
              <NLogItem
                className="compact"
                fullDate={true}
                {log}
                on:locationClick={event => {
                  Interact.showLocations([log]);
                }}
                show24Hour={$UserStore.meta.is24Hour}
                on:moreClick={event => {
                  Interact.logOptions(log).then(() => {});
                }}
                trackers={$TrackerStore} />
            {/each}
          {/await}
        </div>
      {/if}
    </main>
  {:else}
    <main class="loading-main stat-view-body">Loading...</main>
  {/if}

</Modal>
