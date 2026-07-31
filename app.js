// Global state
let supabaseClient = null;
let currentUrl = '';
let currentKey = '';
let allTables = [];
let activeTable = null;
let activeColumns = [];
let currentPage = 1;
const pageSize = 15;
let totalRows = 0;
let tableSchemaInfo = {}; // Columns, types, primary keys from OpenAPI spec
let dataSearchQuery = '';

// DOM Elements
const dataSearchInput = document.getElementById('data-search');
const connectScreen = document.getElementById('connect-screen');
const connectForm = document.getElementById('connect-form');
const sbUrlInput = document.getElementById('sb-url');
const sbKeyInput = document.getElementById('sb-key');
const rememberMeCheckbox = document.getElementById('remember-me');
const connectError = document.getElementById('connect-error');

const connStatusIndicator = document.getElementById('conn-status-indicator');
const connStatusText = document.getElementById('conn-status-text');
const disconnectBtn = document.getElementById('disconnect-btn');

const tableSearchInput = document.getElementById('table-search');
const tablesList = document.getElementById('tables-list');
const rawSqlBtn = document.getElementById('raw-sql-btn');

const activeTableName = document.getElementById('active-table-name');
const activeTableCount = document.getElementById('active-table-count');
const tableActions = document.getElementById('table-actions');
const refreshTableBtn = document.getElementById('refresh-table-btn');
const addRowBtn = document.getElementById('add-row-btn');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');

const dataWorkspace = document.getElementById('data-workspace');
const emptyState = document.getElementById('empty-state');
const gridView = document.getElementById('grid-view');
const gridHeader = document.getElementById('grid-header');
const gridBody = document.getElementById('grid-body');

const pagShowingStart = document.getElementById('pag-showing-start');
const pagShowingEnd = document.getElementById('pag-showing-end');
const currentPageNum = document.getElementById('current-page-num');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');

// SQL Panel Elements
const sqlPanel = document.getElementById('sql-panel');
const closeSqlBtn = document.getElementById('close-sql-btn');
const sqlInput = document.getElementById('sql-input');
const executeSqlBtn = document.getElementById('execute-sql-btn');
const sqlResultContainer = document.getElementById('sql-result-container');
const sqlResult = document.getElementById('sql-result');

// CRUD Modal Elements
const crudModal = document.getElementById('crud-modal');
const crudModalTitle = document.getElementById('crud-modal-title');
const crudForm = document.getElementById('crud-form');
const closeCrudModalBtn = document.getElementById('close-crud-modal');
const cancelCrudBtn = document.getElementById('cancel-crud-btn');
const saveCrudBtn = document.getElementById('save-crud-btn');
let editingRowData = null; // null for add mode, row object for edit mode

// Import Modal Elements
const importModal = document.getElementById('import-modal');
const closeImportModalBtn = document.getElementById('close-import-modal');
const cancelImportBtn = document.getElementById('cancel-import-btn');
const confirmImportBtn = document.getElementById('confirm-import-btn');
const dropzone = document.getElementById('dropzone');
const importFileInput = document.getElementById('import-file-input');
const importMapping = document.getElementById('import-mapping');
const mappingList = document.getElementById('mapping-list');
const importStatus = document.getElementById('import-status');
let parsedImportData = null;

// Initialize Lucide Icons
function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Initialization on load
window.addEventListener('DOMContentLoaded', () => {
  refreshIcons();
  
  // Check for saved credentials
  const savedUrl = localStorage.getItem('supabase_url');
  const savedKey = localStorage.getItem('supabase_key');
  
  if (savedUrl && savedKey) {
    sbUrlInput.value = savedUrl;
    sbKeyInput.value = savedKey;
    rememberMeCheckbox.checked = true;
    attemptConnection(savedUrl, savedKey);
  }
});

// Event Listeners
connectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = sbUrlInput.value.trim();
  const key = sbKeyInput.value.trim();
  attemptConnection(url, key);
});

disconnectBtn.addEventListener('click', disconnect);

tableSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  renderTablesList(query);
});

let searchTimeout;
dataSearchInput.addEventListener('input', (e) => {
  dataSearchQuery = e.target.value;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage = 1;
    if (activeTable) {
      fetchTableData(activeTable);
    }
  }, 400);
});

refreshTableBtn.addEventListener('click', () => {
  if (activeTable) fetchTableData(activeTable);
});

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    fetchTableData(activeTable);
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage * pageSize < totalRows) {
    currentPage++;
    fetchTableData(activeTable);
  }
});

// SQL Panel Actions
rawSqlBtn.addEventListener('click', () => {
  hideAllPanels();
  sqlPanel.classList.remove('hidden');
  sqlResultContainer.classList.add('hidden');
});

closeSqlBtn.addEventListener('click', () => {
  sqlPanel.classList.add('hidden');
  if (activeTable) {
    gridView.classList.remove('hidden');
  } else {
    emptyState.classList.remove('hidden');
  }
});

executeSqlBtn.addEventListener('click', async () => {
  const query = sqlInput.value.trim();
  if (!query) return;

  executeSqlBtn.disabled = true;
  executeSqlBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang chạy...</span>';
  refreshIcons();

  try {
    // Standard Supabase client doesn't have raw SQL capability directly unless RPC is defined.
    // However, we can run general SQL queries if there is an rpc function called exec_sql or similar.
    // If not, we warn the user or attempt to query PG catalog via RPC.
    const { data, error } = await supabaseClient.rpc('exec_sql', { sql: query });
    
    sqlResultContainer.classList.remove('hidden');
    if (error) {
      // Fallback message about setup if exec_sql function doesn't exist
      if (error.message.includes('function rpc.exec_sql does not exist')) {
        sqlResult.innerHTML = `<span class="text-red-400">Lỗi: API RPC 'exec_sql' chưa được cấu hình.</span>\n\nĐể chạy trực tiếp SQL, vui lòng chạy lệnh này trong SQL Editor của Supabase:\n\n<code class="block bg-zinc-900 p-3 rounded mt-2 select-all">create or replace function exec_sql(sql text)\nreturns json as $$\ndeclare\n  ref refcursor;\n  result json;\nbegin\n  execute sql;\n  -- Lấy kết quả trả về dưới dạng JSON\n  -- Lưu ý: chỉ phục vụ demo, sử dụng cẩn trọng bảo mật\n  return '{"status": "success"}'::json;\nend;\n$$ language plpgsql security definer;</code>`;
      } else {
        sqlResult.textContent = JSON.stringify(error, null, 2);
        sqlResult.className = "text-xs font-mono text-red-400 overflow-x-auto whitespace-pre-wrap";
      }
    } else {
      sqlResult.textContent = JSON.stringify(data, null, 2);
      sqlResult.className = "text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap";
    }
  } catch (err) {
    sqlResultContainer.classList.remove('hidden');
    sqlResult.textContent = err.message;
    sqlResult.className = "text-xs font-mono text-red-400 overflow-x-auto whitespace-pre-wrap";
  } finally {
    executeSqlBtn.disabled = false;
    executeSqlBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i><span>Thực thi</span>';
    refreshIcons();
  }
});

// CRUD Modal Actions
addRowBtn.addEventListener('click', () => {
  editingRowData = null;
  crudModalTitle.textContent = `Thêm dòng mới vào [${activeTable}]`;
  buildCrudForm();
  crudModal.classList.remove('hidden');
});

closeCrudModalBtn.addEventListener('click', () => crudModal.classList.add('hidden'));
cancelCrudBtn.addEventListener('click', () => crudModal.classList.add('hidden'));

saveCrudBtn.addEventListener('click', async () => {
  const formElements = crudForm.elements;
  const rowData = {};

  for (let element of formElements) {
    if (element.name) {
      if (element.type === 'checkbox') {
        rowData[element.name] = element.checked;
      } else if (element.value === '' && element.placeholder === 'NULL') {
        // Leave empty if optional or handle NULL
        rowData[element.name] = null;
      } else {
        rowData[element.name] = element.value;
      }
    }
  }

  saveCrudBtn.disabled = true;
  saveCrudBtn.textContent = 'Đang lưu...';

  try {
    let result;
    if (editingRowData) {
      // Find Primary Key to target
      const pk = getPrimaryKey(activeTable);
      if (pk && editingRowData[pk] !== undefined) {
        result = await supabaseClient.from(activeTable).update(rowData).eq(pk, editingRowData[pk]);
      } else {
        // Fallback: match entire original row contents
        let builder = supabaseClient.from(activeTable).update(rowData);
        Object.keys(editingRowData).forEach(key => {
          if (editingRowData[key] !== null) {
            builder = builder.eq(key, editingRowData[key]);
          } else {
            builder = builder.is(key, null);
          }
        });
        result = await builder;
      }
    } else {
      result = await supabaseClient.from(activeTable).insert([rowData]);
    }

    if (result.error) throw result.error;

    crudModal.classList.add('hidden');
    fetchTableData(activeTable);
  } catch (error) {
    alert(`Lỗi khi cập nhật dữ liệu: ${error.message}`);
  } finally {
    saveCrudBtn.disabled = false;
    saveCrudBtn.textContent = editingRowData ? 'Cập nhật' : 'Thêm mới';
  }
});

// Import Actions
importBtn.addEventListener('click', () => {
  importModal.classList.remove('hidden');
  resetImportState();
});

closeImportModalBtn.addEventListener('click', () => importModal.classList.add('hidden'));
cancelImportBtn.addEventListener('click', () => importModal.classList.add('hidden'));

dropzone.addEventListener('click', () => importFileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('border-blue-500', 'bg-blue-500/5');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('border-blue-500', 'bg-blue-500/5');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('border-blue-500', 'bg-blue-500/5');
  if (e.dataTransfer.files.length > 0) {
    handleImportFile(e.dataTransfer.files[0]);
  }
});

importFileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleImportFile(e.target.files[0]);
  }
});

confirmImportBtn.addEventListener('click', async () => {
  if (!parsedImportData || !activeTable) return;

  confirmImportBtn.disabled = true;
  confirmImportBtn.textContent = 'Đang import...';
  importStatus.textContent = 'Đang tiến hành import dữ liệu...';

  // Read mapping selects
  const mappings = {};
  const mappingSelects = mappingList.querySelectorAll('select');
  mappingSelects.forEach(select => {
    const tableCol = select.dataset.col;
    const fileCol = select.value;
    if (fileCol) {
      mappings[tableCol] = fileCol;
    }
  });

  // Prepare batch insert rows
  const rowsToInsert = parsedImportData.map(fileRow => {
    const dbRow = {};
    Object.keys(mappings).forEach(dbCol => {
      const fileColName = mappings[dbCol];
      let val = fileRow[fileColName];
      if (val === '' || val === undefined) {
        val = null;
      }
      dbRow[dbCol] = val;
    });
    return dbRow;
  });

  try {
    // Batch insert in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);
      const { error } = await supabaseClient.from(activeTable).insert(chunk);
      if (error) throw error;
    }

    importStatus.className = "text-xs text-emerald-400";
    importStatus.textContent = `Thành công! Đã import ${rowsToInsert.length} dòng.`;
    setTimeout(() => {
      importModal.classList.add('hidden');
      fetchTableData(activeTable);
    }, 1500);

  } catch (err) {
    importStatus.className = "text-xs text-red-400";
    importStatus.textContent = `Lỗi: ${err.message}`;
    confirmImportBtn.disabled = false;
    confirmImportBtn.textContent = 'Import dữ liệu';
  }
});

// Export Actions
exportBtn.addEventListener('click', async () => {
  if (!activeTable) return;
  
  exportBtn.disabled = true;
  exportBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang chuẩn bị...</span>';
  refreshIcons();

  try {
    let allData = [];
    let pageIndex = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      exportBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang tải ${allData.length} dòng...</span>`;
      refreshIcons();

      const start = pageIndex * batchSize;
      const end = start + batchSize - 1;

      const { data, error } = await supabaseClient
        .from(activeTable)
        .select('*')
        .range(start, end);

      if (error) throw error;

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData = allData.concat(data);
        if (data.length < batchSize) {
          hasMore = false;
        } else {
          pageIndex++;
        }
      }
    }

    exportBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Đang tạo file...</span>';
    refreshIcons();

    // Trigger CSV download
    const csv = Papa.unparse(allData);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeTable}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    alert(`Lỗi xuất file: ${err.message}`);
  } finally {
    exportBtn.disabled = false;
    exportBtn.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i><span>Tải về (Export)</span>';
    refreshIcons();
  }
});

// Helper Functions
function hideAllPanels() {
  emptyState.classList.add('hidden');
  gridView.classList.add('hidden');
  sqlPanel.classList.add('hidden');
}

async function attemptConnection(url, key) {
  try {
    // Auto-detect and fix dashboard URL to API URL
    let formattedUrl = url.trim();
    if (formattedUrl.includes('supabase.com/dashboard/project/')) {
      const match = formattedUrl.match(/project\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        formattedUrl = `https://${match[1]}.supabase.co`;
        // Update input field to show formatted URL
        sbUrlInput.value = formattedUrl;
      }
    }

    // Initialize Supabase Client
    supabaseClient = supabase.createClient(formattedUrl, key);
    
    // Test connection by fetching OpenAPI details to list tables
    const restEndpoint = `${formattedUrl.replace(/\/$/, '')}/rest/v1/`;
    const res = await fetch(restEndpoint, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

    const spec = await res.json();
    parseOpenApiSchema(spec);

    // Reset error panel
    connectError.classList.add('hidden');
    connectError.textContent = '';

    // Save configuration if remember me checked
    if (rememberMeCheckbox.checked) {
      localStorage.setItem('supabase_url', url);
      localStorage.setItem('supabase_key', key);
    } else {
      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_key');
    }

    currentUrl = url;
    currentKey = key;

    // Update Status UI
    connStatusIndicator.className = "status-indicator connected";
    connStatusText.textContent = "Đã kết nối: " + new URL(formattedUrl).hostname;
    connectScreen.classList.add('opacity-0', 'pointer-events-none');
    disconnectBtn.classList.remove('hidden');

    renderTablesList();
  } catch (error) {
    console.error(error);
    connectError.classList.remove('hidden');
    if (error.message.includes('401')) {
      connectError.textContent = 'Lỗi 401: API Key không chính xác hoặc đã hết hạn. Vui lòng kiểm tra lại Anon hoặc Service Role Key.';
    } else {
      connectError.textContent = `Kết nối thất bại: ${error.message}. Vui lòng kiểm tra lại URL và API Key.`;
    }
  }
}

function disconnect() {
  supabaseClient = null;
  currentUrl = '';
  currentKey = '';
  allTables = [];
  activeTable = null;
  tableSchemaInfo = {};
  dataSearchQuery = '';
  if (dataSearchInput) dataSearchInput.value = '';
  
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_key');

  connStatusIndicator.className = "status-indicator disconnected";
  connStatusText.textContent = "Chưa kết nối";
  connectScreen.classList.remove('opacity-0', 'pointer-events-none');
  disconnectBtn.classList.add('hidden');
  
  hideAllPanels();
  emptyState.classList.remove('hidden');
  tableActions.classList.add('hidden');
  activeTableName.textContent = "Chọn bảng để làm việc";
  activeTableCount.classList.add('hidden');
}

function parseOpenApiSchema(spec) {
  allTables = [];
  tableSchemaInfo = {};

  if (!spec.definitions) return;

  allTables = Object.keys(spec.definitions).sort();
  
  allTables.forEach(tableName => {
    const definition = spec.definitions[tableName];
    const properties = definition.properties || {};
    const columns = Object.keys(properties).map(colName => {
      return {
        name: colName,
        type: properties[colName].type,
        format: properties[colName].format,
        description: properties[colName].description,
        required: (definition.required || []).includes(colName)
      };
    });

    tableSchemaInfo[tableName] = {
      columns: columns,
      // Guess primary key based on id column or name ending in _id
      primaryKey: columns.find(c => c.name === 'id' || c.name === `${tableName}_id`)?.name || columns[0]?.name
    };
  });
}

function getPrimaryKey(tableName) {
  return tableSchemaInfo[tableName]?.primaryKey || 'id';
}

function renderTablesList(filter = '') {
  tablesList.innerHTML = '';
  const filtered = allTables.filter(t => t.toLowerCase().includes(filter));

  if (filtered.length === 0) {
    tablesList.innerHTML = `<div class="text-zinc-500 text-sm text-center py-4">Không tìm thấy bảng phù hợp</div>`;
    return;
  }

  filtered.forEach(tableName => {
    const btn = document.createElement('button');
    btn.className = `w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 flex items-center justify-between ${
      activeTable === tableName 
        ? 'bg-brand/10 text-brand border border-brand/20' 
        : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border border-transparent'
    }`;
    btn.innerHTML = `
      <div class="flex items-center gap-2 truncate">
        <i data-lucide="table-2" class="w-4 h-4 shrink-0"></i>
        <span class="truncate font-medium">${tableName}</span>
      </div>
      <i data-lucide="chevron-right" class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity"></i>
    `;
    
    btn.addEventListener('click', () => {
      activeTable = tableName;
      currentPage = 1;
      dataSearchQuery = '';
      if (dataSearchInput) dataSearchInput.value = '';
      // Re-render table list to highlight current selection
      renderTablesList(filter);
      fetchTableData(tableName);
    });

    tablesList.appendChild(btn);
  });
  refreshIcons();
}

async function fetchTableData(tableName) {
  hideAllPanels();
  gridView.classList.remove('hidden');
  tableActions.classList.remove('hidden');
  activeTableName.textContent = tableName;
  activeTableCount.classList.remove('hidden');
  activeTableCount.textContent = 'Đang tải...';

  const columns = tableSchemaInfo[tableName]?.columns || [];
  activeColumns = columns.map(c => c.name);

  // Setup headers
  gridHeader.innerHTML = '';
  const trHeader = document.createElement('tr');
  
  // Action header
  const thAction = document.createElement('th');
  thAction.className = 'px-4 py-3 text-xs uppercase tracking-wider text-zinc-500 w-24 text-center';
  thAction.textContent = 'Hành động';
  trHeader.appendChild(thAction);

  activeColumns.forEach(colName => {
    const th = document.createElement('th');
    th.className = 'px-4 py-3 text-xs uppercase tracking-wider text-zinc-400';
    th.textContent = colName;
    trHeader.appendChild(th);
  });
  gridHeader.appendChild(trHeader);

  // Fetch count and range
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize - 1;

  try {
    let queryBuilder = supabaseClient.from(tableName).select('*', { count: 'exact' });

    if (dataSearchQuery && dataSearchQuery.trim()) {
      const cleanSearch = dataSearchQuery.trim();
      const stringColumns = columns.filter(c => c.type === 'string');
      if (stringColumns.length > 0) {
        const orConditions = stringColumns.map(c => `${c.name}.ilike.%${cleanSearch}%`).join(',');
        queryBuilder = queryBuilder.or(orConditions);
      }
    }

    const { data, count, error } = await queryBuilder.range(start, end);

    if (error) throw error;

    totalRows = count || 0;
    activeTableCount.textContent = `${totalRows} dòng`;

    // Populate data
    gridBody.innerHTML = '';
    
    if (data.length === 0) {
      gridBody.innerHTML = `
        <tr>
          <td colspan="${activeColumns.length + 1}" class="px-4 py-8 text-center text-zinc-500">
            Bảng này chưa có dữ liệu nào.
          </td>
        </tr>
      `;
      updatePaginationControls();
      return;
    }

    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-zinc-800/20';

      // Action column
      const tdAction = document.createElement('td');
      tdAction.className = 'px-4 py-2 text-center flex items-center justify-center gap-2';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'p-1 hover:text-blue-400 text-zinc-500 transition-colors';
      editBtn.innerHTML = '<i data-lucide="edit-3" class="w-4 h-4"></i>';
      editBtn.addEventListener('click', () => {
        editingRowData = row;
        crudModalTitle.textContent = `Sửa dòng trong [${activeTable}]`;
        buildCrudForm(row);
        crudModal.classList.remove('hidden');
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'p-1 hover:text-red-400 text-zinc-500 transition-colors';
      delBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
      delBtn.addEventListener('click', () => deleteRow(row));

      tdAction.appendChild(editBtn);
      tdAction.appendChild(delBtn);
      tr.appendChild(tdAction);

      // Data columns
      activeColumns.forEach(colName => {
        const td = document.createElement('td');
        td.className = 'px-4 py-2.5 max-w-xs truncate text-zinc-300 font-mono text-xs';
        const val = row[colName];
        td.textContent = val === null ? 'NULL' : typeof val === 'object' ? JSON.stringify(val) : val;
        if (val === null) td.classList.add('text-zinc-600');
        tr.appendChild(td);
      });

      gridBody.appendChild(tr);
    });

    updatePaginationControls();
    refreshIcons();
  } catch (err) {
    gridBody.innerHTML = `
      <tr>
        <td colspan="${activeColumns.length + 1}" class="px-4 py-8 text-center text-red-400 font-medium">
          Lỗi: ${err.message}
        </td>
      </tr>
    `;
    activeTableCount.textContent = 'Lỗi';
  }
}

async function deleteRow(row) {
  if (!confirm('Bạn có chắc chắn muốn xóa dòng này không?')) return;

  const pk = getPrimaryKey(activeTable);
  try {
    let result;
    if (pk && row[pk] !== undefined) {
      result = await supabaseClient.from(activeTable).delete().eq(pk, row[pk]);
    } else {
      // Fallback: match entire original row contents
      let builder = supabaseClient.from(activeTable).delete();
      Object.keys(row).forEach(key => {
        if (row[key] !== null) {
          builder = builder.eq(key, row[key]);
        } else {
          builder = builder.is(key, null);
        }
      });
      result = await builder;
    }

    if (result.error) throw result.error;
    fetchTableData(activeTable);
  } catch (error) {
    alert(`Lỗi khi xóa dòng: ${error.message}`);
  }
}

function updatePaginationControls() {
  const start = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalRows);
  
  pagShowingStart.textContent = start;
  pagShowingEnd.textContent = end;
  currentPageNum.textContent = currentPage;

  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage * pageSize >= totalRows;
}

function buildCrudForm(row = null) {
  crudForm.innerHTML = '';
  const columns = tableSchemaInfo[activeTable]?.columns || [];

  columns.forEach(col => {
    const div = document.createElement('div');
    div.className = 'space-y-1';

    const label = document.createElement('label');
    label.className = 'block text-xs font-semibold text-zinc-400 uppercase tracking-wider';
    label.textContent = col.name + (col.required ? ' *' : '');
    div.appendChild(label);

    let input;
    if (col.type === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'rounded bg-zinc-800 border-zinc-700 text-brand focus:ring-brand h-5 w-5';
      if (row) input.checked = !!row[col.name];
    } else {
      input = document.createElement('input');
      input.type = col.type === 'integer' || col.type === 'number' ? 'number' : 'text';
      input.className = 'w-full custom-input px-3 py-2 text-sm focus:outline-none';
      input.placeholder = col.required ? 'Bắt buộc' : 'NULL';
      if (row && row[col.name] !== null) {
        input.value = row[col.name];
      }
    }

    input.name = col.name;
    // Don't edit Primary Key on Edit Mode
    if (row && col.name === getPrimaryKey(activeTable)) {
      input.disabled = true;
      input.className += ' opacity-50 cursor-not-allowed';
    }

    div.appendChild(input);
    crudForm.appendChild(div);
  });
}

function resetImportState() {
  parsedImportData = null;
  importFileInput.value = '';
  importMapping.classList.add('hidden');
  dropzone.classList.remove('hidden');
  confirmImportBtn.disabled = true;
  importStatus.className = "text-xs text-zinc-400";
  importStatus.textContent = 'Chọn file để bắt đầu.';
  mappingList.innerHTML = '';
}

function handleImportFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    
    if (extension === 'csv') {
      Papa.parse(content, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
          setupImportMapping(results.data, results.meta.fields);
        },
        error: function(err) {
          alert('Lỗi phân tích file CSV: ' + err.message);
        }
      });
    } else if (extension === 'json' || extension === 'geojson') {
      try {
        const parsed = JSON.parse(content);
        let dataArray = [];
        
        if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
          dataArray = parsed.features.map(f => {
            const row = { ...f.properties };
            if (f.geometry) {
              row['geometry'] = f.geometry;
              row['geom'] = f.geometry;
            }
            return row;
          });
        } else if (parsed.type === 'Feature') {
          const row = { ...parsed.properties };
          if (parsed.geometry) {
            row['geometry'] = parsed.geometry;
            row['geom'] = parsed.geometry;
          }
          dataArray = [row];
        } else {
          dataArray = Array.isArray(parsed) ? parsed : [parsed];
        }

        const fields = [];
        dataArray.forEach(item => {
          Object.keys(item).forEach(key => {
            if (!fields.includes(key)) fields.push(key);
          });
        });

        setupImportMapping(dataArray, fields);
      } catch (err) {
        alert(`Lỗi phân tích file ${extension.toUpperCase()}: ` + err.message);
      }
    }
  };

  reader.readAsText(file);
}

function setupImportMapping(data, fields) {
  parsedImportData = data;
  dropzone.classList.add('hidden');
  importMapping.classList.remove('hidden');
  confirmImportBtn.disabled = false;
  
  importStatus.textContent = `Đã nhận diện ${data.length} dòng. Hãy ánh xạ các trường thông tin bên dưới.`;

  const dbCols = tableSchemaInfo[activeTable]?.columns || [];
  
  mappingList.innerHTML = '';
  dbCols.forEach(dbCol => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between py-2 border-b border-zinc-800/40 text-sm';
    
    const label = document.createElement('span');
    label.className = 'font-semibold text-zinc-300';
    label.textContent = dbCol.name + (dbCol.required ? ' *' : '');
    
    const select = document.createElement('select');
    select.className = 'custom-input px-3 py-1 text-xs focus:outline-none';
    select.dataset.col = dbCol.name;
    
    // Add empty option
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- Bỏ qua --';
    select.appendChild(emptyOpt);
    
    fields.forEach(field => {
      const opt = document.createElement('option');
      opt.value = field;
      opt.textContent = field;
      // Auto match same names
      if (field.toLowerCase() === dbCol.name.toLowerCase()) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    row.appendChild(label);
    row.appendChild(select);
    mappingList.appendChild(row);
  });
}

// Create Table Feature
const createTableModal = document.getElementById('create-table-modal');
const createTableBtn = document.getElementById('create-table-btn');
const closeCreateTableModalBtn = document.getElementById('close-create-table-modal');
const cancelCreateTableBtn = document.getElementById('cancel-create-table-btn');
const confirmCreateTableBtn = document.getElementById('confirm-create-table-btn');
const newTableNameInput = document.getElementById('new-table-name');
const newTableColumnsContainer = document.getElementById('new-table-columns');
const addColumnFieldBtn = document.getElementById('add-column-field-btn');
const createTableStatus = document.getElementById('create-table-status');

// New File Tab Elements
const tabCreateManual = document.getElementById('tab-create-manual');
const tabCreateFile = document.getElementById('tab-create-file');
const createManualSection = document.getElementById('create-manual-section');
const createFileSection = document.getElementById('create-file-section');
const createDropzone = document.getElementById('create-dropzone');
const createFileInput = document.getElementById('create-file-input');
const createFileSetup = document.getElementById('create-file-setup');
const newTableFileName = document.getElementById('new-table-file-name');
const newTableFileColumns = document.getElementById('new-table-file-columns');

let currentCreateMode = 'manual'; // 'manual' or 'file'
let parsedCreateFileData = null;
let parsedCreateFileColumns = []; // [{ name, type, originalName }]

// Columns metadata
const sqlDataTypes = [
  { value: 'text', label: 'text (Chuỗi văn bản)' },
  { value: 'integer', label: 'integer (Số nguyên)' },
  { value: 'numeric', label: 'numeric (Số thập phân)' },
  { value: 'boolean', label: 'boolean (Đúng / Sai)' },
  { value: 'timestamp with time zone', label: 'timestamptz (Ngày giờ)' },
  { value: 'jsonb', label: 'jsonb (Dữ liệu JSON)' },
  { value: 'geometry(Geometry, 4326)', label: 'geometry (Tọa độ GIS - PostGIS)' }
];

// Tab Switching
tabCreateManual.addEventListener('click', () => switchCreateTab('manual'));
tabCreateFile.addEventListener('click', () => switchCreateTab('file'));

function switchCreateTab(mode) {
  currentCreateMode = mode;
  if (mode === 'manual') {
    tabCreateManual.className = "px-4 py-2 text-sm font-semibold border-b-2 border-brand text-brand transition-all";
    tabCreateFile.className = "px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition-all";
    createManualSection.classList.remove('hidden');
    createFileSection.classList.add('hidden');
  } else {
    tabCreateManual.className = "px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition-all";
    tabCreateFile.className = "px-4 py-2 text-sm font-semibold border-b-2 border-brand text-brand transition-all";
    createManualSection.classList.add('hidden');
    createFileSection.classList.remove('hidden');
  }
}

createTableBtn.addEventListener('click', () => {
  if (!supabaseClient) {
    alert('Vui lòng kết nối dự án Supabase trước!');
    return;
  }
  createTableModal.classList.remove('hidden');
  resetCreateTableForm();
});

closeCreateTableModalBtn.addEventListener('click', () => createTableModal.classList.add('hidden'));
cancelCreateTableBtn.addEventListener('click', () => createTableModal.classList.add('hidden'));

// Manual columns list actions
addColumnFieldBtn.addEventListener('click', () => {
  const colDiv = document.createElement('div');
  colDiv.className = 'flex items-center gap-2 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-800/80 column-entry animate-fade-in';
  
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Tên cột (ví dụ: title, price)';
  nameInput.className = 'w-1/4 custom-input px-3 py-1.5 text-xs col-name-input';
  nameInput.required = true;

  const typeSelect = document.createElement('select');
  typeSelect.className = 'w-1/4 custom-input px-3 py-1.5 text-xs col-type-select';
  sqlDataTypes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    typeSelect.appendChild(opt);
  });

  const pkLabel = document.createElement('label');
  pkLabel.className = 'flex items-center gap-1.5 text-xs text-zinc-400 w-1/4';
  const pkCheck = document.createElement('input');
  pkCheck.type = 'checkbox';
  pkCheck.className = 'rounded bg-zinc-800 border-zinc-700 text-brand focus:ring-brand h-4 w-4 col-pk-check';
  pkLabel.appendChild(pkCheck);
  const pkSpan = document.createElement('span');
  pkSpan.textContent = 'Khóa chính';
  pkLabel.appendChild(pkSpan);

  const nnLabel = document.createElement('label');
  nnLabel.className = 'flex items-center gap-1.5 text-xs text-zinc-400 w-1/4';
  const nnCheck = document.createElement('input');
  nnCheck.type = 'checkbox';
  nnCheck.className = 'rounded bg-zinc-800 border-zinc-700 text-brand focus:ring-brand h-4 w-4 col-nn-check';
  nnLabel.appendChild(nnCheck);
  const nnSpan = document.createElement('span');
  nnSpan.textContent = 'Bắt buộc';
  nnLabel.appendChild(nnSpan);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'p-1.5 hover:text-red-400 text-zinc-500 transition-colors';
  removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
  removeBtn.addEventListener('click', () => colDiv.remove());

  colDiv.appendChild(nameInput);
  colDiv.appendChild(typeSelect);
  colDiv.appendChild(pkLabel);
  colDiv.appendChild(nnLabel);
  colDiv.appendChild(removeBtn);
  
  newTableColumnsContainer.appendChild(colDiv);
  refreshIcons();
});

// File Tab Actions
createDropzone.addEventListener('click', () => createFileInput.click());
createDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  createDropzone.classList.add('border-brand', 'bg-brand/5');
});
createDropzone.addEventListener('dragleave', () => {
  createDropzone.classList.remove('border-brand', 'bg-brand/5');
});
createDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  createDropzone.classList.remove('border-brand', 'bg-brand/5');
  if (e.dataTransfer.files.length > 0) {
    handleCreateFile(e.dataTransfer.files[0]);
  }
});
createFileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleCreateFile(e.target.files[0]);
  }
});

function handleCreateFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  const rawName = file.name.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
  newTableFileName.value = rawName;

  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    
    if (extension === 'csv') {
      Papa.parse(content, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
          analyzeFileData(results.data, results.meta.fields);
        },
        error: function(err) {
          alert('Lỗi đọc file CSV: ' + err.message);
        }
      });
    } else if (extension === 'json' || extension === 'geojson') {
      try {
        const parsed = JSON.parse(content);
        let dataArray = [];
        
        if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
          dataArray = parsed.features.map(f => {
            const row = { ...f.properties };
            if (f.geometry) {
              row['geometry'] = f.geometry;
              row['geom'] = f.geometry;
            }
            return row;
          });
        } else if (parsed.type === 'Feature') {
          const row = { ...parsed.properties };
          if (parsed.geometry) {
            row['geometry'] = parsed.geometry;
            row['geom'] = parsed.geometry;
          }
          dataArray = [row];
        } else {
          dataArray = Array.isArray(parsed) ? parsed : [parsed];
        }

        const fields = [];
        dataArray.forEach(item => {
          Object.keys(item).forEach(key => {
            if (!fields.includes(key)) fields.push(key);
          });
        });

        analyzeFileData(dataArray, fields);
      } catch (err) {
        alert('Lỗi đọc file JSON: ' + err.message);
      }
    }
  };
  reader.readAsText(file);
}

function inferDataType(sampleValue, columnName) {
  if (columnName.toLowerCase() === 'geom' || columnName.toLowerCase() === 'geometry') {
    return 'geometry(Geometry, 4326)';
  }
  if (sampleValue === null || sampleValue === undefined) return 'text';
  if (typeof sampleValue === 'boolean') return 'boolean';
  if (typeof sampleValue === 'number') {
    return Number.isInteger(sampleValue) ? 'integer' : 'numeric';
  }
  if (typeof sampleValue === 'object') return 'jsonb';
  // Check date string
  if (typeof sampleValue === 'string' && !isNaN(Date.parse(sampleValue)) && sampleValue.includes('-')) {
    return 'timestamp with time zone';
  }
  return 'text';
}

function analyzeFileData(data, fields) {
  parsedCreateFileData = data;
  createDropzone.classList.add('hidden');
  createFileSetup.classList.remove('hidden');

  newTableFileColumns.innerHTML = '';
  parsedCreateFileColumns = [];

  // Inspect first 5 rows to guess types
  const sampleRows = data.slice(0, 5);

  fields.forEach(field => {
    // Find first non-null sample
    let sampleVal = null;
    for (let r of sampleRows) {
      if (r[field] !== null && r[field] !== undefined && r[field] !== '') {
        sampleVal = r[field];
        break;
      }
    }

    const inferredType = inferDataType(sampleVal, field);
    const sanitizedName = field.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    const colRow = document.createElement('div');
    colRow.className = 'flex items-center gap-2 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-800/80 file-column-entry';
    
    // Checkbox to include/exclude
    const activeCheck = document.createElement('input');
    activeCheck.type = 'checkbox';
    activeCheck.checked = true;
    activeCheck.className = 'rounded bg-zinc-800 border-zinc-700 text-brand focus:ring-brand h-4 w-4 col-file-active';
    
    // Label original field name
    const originalLabel = document.createElement('span');
    originalLabel.className = 'text-xs text-zinc-500 w-1/4 truncate';
    originalLabel.textContent = field;
    originalLabel.title = `Tên gốc: ${field}`;

    // Target Column Name
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = sanitizedName;
    nameInput.className = 'w-1/4 custom-input px-3 py-1.5 text-xs col-file-name-input';

    // Target Column Type
    const typeSelect = document.createElement('select');
    typeSelect.className = 'w-1/3 custom-input px-3 py-1.5 text-xs col-file-type-select';
    sqlDataTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = t.label;
      if (t.value === inferredType) opt.selected = true;
      typeSelect.appendChild(opt);
    });

    colRow.appendChild(activeCheck);
    colRow.appendChild(originalLabel);
    colRow.appendChild(nameInput);
    colRow.appendChild(typeSelect);

    // Keep hidden reference to original name
    colRow.dataset.originalField = field;

    newTableFileColumns.appendChild(colRow);
  });
}

function resetCreateTableForm() {
  switchCreateTab('manual');
  newTableNameInput.value = '';
  createTableStatus.className = 'text-xs text-zinc-400';
  createTableStatus.textContent = 'Thiết lập cấu trúc bảng để bắt đầu.';
  
  // Reset manual columns list
  const addedCols = newTableColumnsContainer.querySelectorAll('.column-entry');
  addedCols.forEach(col => col.remove());

  // Reset file upload section
  parsedCreateFileData = null;
  parsedCreateFileColumns = [];
  createFileInput.value = '';
  createDropzone.classList.remove('hidden');
  createFileSetup.classList.add('hidden');
  newTableFileColumns.innerHTML = '';
}

confirmCreateTableBtn.addEventListener('click', async () => {
  const tableName = currentCreateMode === 'manual' 
    ? newTableNameInput.value.trim().toLowerCase()
    : newTableFileName.value.trim().toLowerCase();

  if (!tableName) {
    alert('Vui lòng nhập tên bảng.');
    return;
  }

  let query = '';
  let activeMapping = []; // Array of { fileField, dbField }

  if (currentCreateMode === 'manual') {
    const columnEntries = newTableColumnsContainer.querySelectorAll('.column-entry');
    const columnsSqlParts = ['"id" serial PRIMARY KEY'];
    let hasError = false;

    columnEntries.forEach(entry => {
      const name = entry.querySelector('.col-name-input').value.trim().toLowerCase();
      const type = entry.querySelector('.col-type-select').value;
      const isPk = entry.querySelector('.col-pk-check').checked;
      const isNn = entry.querySelector('.col-nn-check').checked;

      if (!name) {
        hasError = true;
        return;
      }

      let colDef = `"${name}" ${type}`;
      if (isPk) colDef += ' PRIMARY KEY';
      if (isNn) colDef += ' NOT NULL';
      columnsSqlParts.push(colDef);
    });

    if (hasError) {
      alert('Vui lòng nhập đầy đủ tên cho các cột.');
      return;
    }

    query = `CREATE TABLE public."${tableName}" (\n  ${columnsSqlParts.join(',\n  ')}\n);`;
  } else {
    // Mode 'file'
    if (!parsedCreateFileData) {
      alert('Vui lòng chọn file dữ liệu trước.');
      return;
    }

    const fileColEntries = newTableFileColumns.querySelectorAll('.file-column-entry');
    const columnsSqlParts = ['"id" serial PRIMARY KEY'];

    fileColEntries.forEach(entry => {
      const isActive = entry.querySelector('.col-file-active').checked;
      const originalField = entry.dataset.originalField;
      const dbColName = entry.querySelector('.col-file-name-input').value.trim().toLowerCase();
      const dbColType = entry.querySelector('.col-file-type-select').value;

      if (isActive && dbColName) {
        columnsSqlParts.push(`"${dbColName}" ${dbColType}`);
        activeMapping.push({ fileField: originalField, dbField: dbColName });
      }
    });

    query = `CREATE TABLE public."${tableName}" (\n  ${columnsSqlParts.join(',\n  ')}\n);`;
  }

  confirmCreateTableBtn.disabled = true;
  confirmCreateTableBtn.textContent = 'Đang thực hiện...';
  createTableStatus.textContent = 'Đang tạo bảng trên Supabase...';

  try {
    // 1. Execute SQL CREATE TABLE
    const { error: createError } = await supabaseClient.rpc('exec_sql', { sql: query });
    
    if (createError) {
      if (createError.message.includes('function rpc.exec_sql does not exist')) {
        throw new Error("RPC 'exec_sql' chưa được cấu hình. Vui lòng xem hướng dẫn cài đặt trong cửa sổ SQL Editor.");
      }
      throw createError;
    }

    // 2. If file mode, insert rows!
    if (currentCreateMode === 'file' && activeMapping.length > 0) {
      createTableStatus.textContent = 'Bảng đã được tạo. Đang import dữ liệu...';
      
      const rowsToInsert = parsedCreateFileData.map(fileRow => {
        const dbRow = {};
        activeMapping.forEach(mapping => {
          let val = fileRow[mapping.fileField];
          if (val === '' || val === undefined) {
            val = null;
          }
          dbRow[mapping.dbField] = val;
        });
        return dbRow;
      });

      // Insert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
        const chunk = rowsToInsert.slice(i, i + chunkSize);
        createTableStatus.textContent = `Đang import dữ liệu (${i}/${rowsToInsert.length} dòng)...`;
        const { error: insertError } = await supabaseClient.from(tableName).insert(chunk);
        if (insertError) throw insertError;
      }
    }

    createTableStatus.className = 'text-xs text-emerald-400';
    createTableStatus.textContent = currentCreateMode === 'file' 
      ? `Thành công! Đã tạo bảng và import ${parsedCreateFileData.length} dòng.`
      : 'Tạo bảng thành công! Đang tải lại danh sách...';

    // Refresh tables list
    setTimeout(async () => {
      createTableModal.classList.add('hidden');
      confirmCreateTableBtn.disabled = false;
      confirmCreateTableBtn.textContent = 'Tạo bảng';
      
      const restEndpoint = `${currentUrl.replace(/\/$/, '')}/rest/v1/`;
      const res = await fetch(restEndpoint, {
        headers: {
          'apikey': currentKey,
          'Authorization': `Bearer ${currentKey}`
        }
      });
      if (res.ok) {
        const spec = await res.json();
        parseOpenApiSchema(spec);
        renderTablesList();
      }
    }, 1500);

  } catch (err) {
    createTableStatus.className = 'text-xs text-red-400';
    createTableStatus.textContent = `Lỗi: ${err.message}`;
    confirmCreateTableBtn.disabled = false;
    confirmCreateTableBtn.textContent = 'Thực hiện';
  }
});
